// Runs one process tree inside a Windows Job Object with a job-wide commit cap.
// The root is created suspended, assigned to the job, then resumed, so no descendant can start
// outside the job. KILL_ON_JOB_CLOSE ends every process of the tree when the host goes away.
// The job-memory limit counts committed memory, which on WDDM includes CUDA allocations.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace PiJobs
{
    public sealed class JobHost : IDisposable
    {
        const uint KILL_ON_JOB_CLOSE = 0x2000, JOB_MEMORY = 0x200, DIE_ON_UNHANDLED_EXCEPTION = 0x400;
        const uint CREATE_SUSPENDED = 0x4, CREATE_UNICODE_ENVIRONMENT = 0x400, CREATE_NO_WINDOW = 0x08000000;
        const uint STARTF_USESTDHANDLES = 0x100, HANDLE_FLAG_INHERIT = 1, WAIT_OBJECT_0 = 0;
        const int ExtendedLimitInformation = 9, AssociateCompletionPortInformation = 7;
        const uint MSG_JOB_MEMORY_LIMIT = 10;

        [StructLayout(LayoutKind.Sequential)]
        struct BasicLimit
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IoCounters { public ulong R, W, O, RB, WB, OB; }

        // Field order matters: Basic, IoInfo, then the four sizes (a wrong order makes the call fail).
        [StructLayout(LayoutKind.Sequential)]
        struct ExtendedLimit
        {
            public BasicLimit Basic;
            public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct CompletionPort { public IntPtr Key, Port; }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct StartupInfo
        {
            public int cb;
            public string Reserved, Desktop, Title;
            public int X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
            public short ShowWindow, Reserved2;
            public IntPtr Reserved3, StdInput, StdOutput, StdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct ProcessInformation { public IntPtr Process, Thread; public int ProcessId, ThreadId; }

        [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimit info, int size);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref CompletionPort info, int size);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool QueryInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimit info, int size, IntPtr returned);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CreateProcessW(string app, StringBuilder commandLine, IntPtr pa, IntPtr ta, bool inherit,
            uint flags, IntPtr environment, string cwd, ref StartupInfo si, out ProcessInformation pi);
        [DllImport("kernel32", SetLastError = true)]
        static extern IntPtr CreateIoCompletionPort(IntPtr file, IntPtr existing, IntPtr key, uint threads);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool GetQueuedCompletionStatus(IntPtr port, out uint bytes, out IntPtr key, out IntPtr overlapped, uint ms);
        [DllImport("kernel32", SetLastError = true)]
        static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32", SetLastError = true)]
        static extern uint WaitForSingleObject(IntPtr handle, uint ms);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
        [DllImport("kernel32", SetLastError = true)]
        static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFileW(string name, uint access, uint share,
            IntPtr security, uint disposition, uint flags, IntPtr template);

        IntPtr job, port, process;
        public int ProcessId { get; private set; }
        public ulong LimitBytes { get; private set; }
        public bool MemoryLimitReached { get; private set; }

        static void Check(bool ok, string what)
        {
            if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), what);
        }

        /// <summary>Quotes one argument per CommandLineToArgvW rules (spaces, quotes, trailing backslashes).</summary>
        public static string QuoteArgument(string arg)
        {
            if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0) return arg;
            var sb = new StringBuilder("\"");
            int slashes = 0;
            foreach (char c in arg)
            {
                if (c == '\\') { slashes++; continue; }
                sb.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
                sb.Append(c);
                slashes = 0;
            }
            sb.Append('\\', slashes * 2).Append('"');
            return sb.ToString();
        }

        static IntPtr EnvironmentBlock(IEnumerable<string> entries)
        {
            var list = new List<string>(entries);
            list.Sort(StringComparer.OrdinalIgnoreCase);
            var sb = new StringBuilder();
            foreach (var entry in list) sb.Append(entry).Append('\0');
            sb.Append('\0');
            return Marshal.StringToHGlobalUni(sb.ToString());
        }

        static FileStream Inheritable(FileStream stream)
        {
            Check(SetHandleInformation(stream.SafeFileHandle.DangerousGetHandle(), HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT), "SetHandleInformation");
            return stream;
        }

        /// <summary>Opens the NUL device for reading (FileStream refuses device names), inheritable.</summary>
        static Microsoft.Win32.SafeHandles.SafeFileHandle OpenNul()
        {
            const uint GENERIC_READ = 0x80000000, SHARE_RW = 3, OPEN_EXISTING = 3;
            var handle = CreateFileW("NUL", GENERIC_READ, SHARE_RW, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            Check(!handle.IsInvalid, "CreateFile(NUL)");
            Check(SetHandleInformation(handle.DangerousGetHandle(), HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT), "SetHandleInformation(NUL)");
            return handle;
        }

        public static JobHost Start(string exe, string[] args, string cwd, string[] environment, string logPath, ulong limitBytes)
        {
            var host = new JobHost { LimitBytes = limitBytes };
            try { host.Launch(exe, args, cwd, environment, logPath); }
            catch { host.Dispose(); throw; }
            return host;
        }

        void Launch(string exe, string[] args, string cwd, string[] environment, string logPath)
        {
            job = CreateJobObjectW(IntPtr.Zero, null);
            Check(job != IntPtr.Zero, "CreateJobObject");
            var limits = new ExtendedLimit();
            limits.Basic.LimitFlags = KILL_ON_JOB_CLOSE | JOB_MEMORY | DIE_ON_UNHANDLED_EXCEPTION;
            limits.JobMemoryLimit = new UIntPtr(LimitBytes);
            Check(SetInformationJobObject(job, ExtendedLimitInformation, ref limits, Marshal.SizeOf(limits)), "SetInformationJobObject(limits)");
            port = CreateIoCompletionPort(new IntPtr(-1), IntPtr.Zero, IntPtr.Zero, 1);
            Check(port != IntPtr.Zero, "CreateIoCompletionPort");
            var association = new CompletionPort { Key = job, Port = port };
            Check(SetInformationJobObject(job, AssociateCompletionPortInformation, ref association, Marshal.SizeOf(association)), "SetInformationJobObject(port)");

            var commandLine = new StringBuilder(QuoteArgument(exe));
            foreach (var arg in args) commandLine.Append(' ').Append(QuoteArgument(arg));
            IntPtr env = EnvironmentBlock(environment);
            using (var log = Inheritable(new FileStream(logPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)))
            using (var nul = OpenNul())
            {
                var si = new StartupInfo { cb = Marshal.SizeOf(typeof(StartupInfo)), Flags = (int)STARTF_USESTDHANDLES };
                si.StdInput = nul.DangerousGetHandle();
                si.StdOutput = si.StdError = log.SafeFileHandle.DangerousGetHandle();
                ProcessInformation pi;
                try
                {
                    Check(CreateProcessW(exe, commandLine, IntPtr.Zero, IntPtr.Zero, true,
                        CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW, env, cwd, ref si, out pi), "CreateProcess");
                }
                finally { Marshal.FreeHGlobal(env); }
                process = pi.Process;
                ProcessId = pi.ProcessId;
                try
                {
                    Check(AssignProcessToJobObject(job, process), "AssignProcessToJobObject");
                    Check(ResumeThread(pi.Thread) != uint.MaxValue, "ResumeThread");
                }
                catch { TerminateProcess(process, 1); throw; }
                finally { CloseHandle(pi.Thread); }
            }
        }

        void DrainNotifications()
        {
            uint message; IntPtr key, overlapped;
            while (GetQueuedCompletionStatus(port, out message, out key, out overlapped, 0))
                if (message == MSG_JOB_MEMORY_LIMIT) MemoryLimitReached = true;
        }

        /// <summary>Waits up to ms for the root process; true once it has exited.</summary>
        public bool WaitForExit(int ms)
        {
            bool exited = WaitForSingleObject(process, (uint)ms) == WAIT_OBJECT_0;
            DrainNotifications();
            return exited;
        }

        public int ExitCode
        {
            get { uint code; Check(GetExitCodeProcess(process, out code), "GetExitCodeProcess"); return unchecked((int)code); }
        }

        public ulong PeakJobCommitBytes
        {
            get
            {
                var info = new ExtendedLimit();
                Check(QueryInformationJobObject(job, ExtendedLimitInformation, ref info, Marshal.SizeOf(info), IntPtr.Zero), "QueryInformationJobObject");
                return info.PeakJobMemoryUsed.ToUInt64();
            }
        }

        /// <summary>Closing the job handle kills whatever is still running in the tree.</summary>
        public void Dispose()
        {
            if (process != IntPtr.Zero) { CloseHandle(process); process = IntPtr.Zero; }
            if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
            if (port != IntPtr.Zero) { CloseHandle(port); port = IntPtr.Zero; }
        }
    }
}
