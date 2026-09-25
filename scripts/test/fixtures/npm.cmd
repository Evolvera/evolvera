@echo off
if "%~1 %~2"=="root -g" (
  echo %FAKE_NPM_ROOT%
  exit /b 0
)
echo %*>>"%FAKE_INSTALL_LOG%"
exit /b 0
