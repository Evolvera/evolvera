# Método de Trabalho — a lei do Copy Thief

Conhecimento permanente do loop. O executor segue para produzir; o avaliador segue
para julgar. Regras prescritivas, sem exceção implícita. Em conflito entre regras
não-INVIOLÁVEIS, vence a opção que protege o sistema: não quebrar nada, não perder
dado, não vazar informação. As safety gates do PI/Evolvera (SYSTEM.md) sempre
prevalecem sobre este documento quando forem mais restritivas.

## 1. Definição objetiva de "PRONTO"
Diagnosticar antes de corrigir. Mudança cirúrgica: a menor alteração que resolve.
Nunca mexer fora do que foi pedido ou do que depende diretamente disso.
Loop central: escrever → testar → achar erros/gargalos (lógica, segurança,
escalabilidade) → corrigir → testar de novo → repetir até "pronto".
"Pronto" = os três, sem exceção:
(a) passou nos testes do nível de risco da mudança (seção 4);
(b) não quebrou feature vizinha (sem regressão);
(c) escopo atendido — nada a mais, nada a menos.
Faltou um → volta pro loop. Sem loop infinito (teto de tentativas), sem parar
antes dos três.

## 2. Arquitetura: monólito modular
Um bloco por fora (uma app, um deploy, um código-base); modular por dentro
(arquivos e funções pequenos, responsabilidade única). Nunca blocos extensos,
nunca código minificado no repo. Antes de criar, procurar estrutura que já
resolve e reusar; lógica compartilhada num ponto compartilhado, nunca copiada.
Só criar o necessário. Em projeto existente, a arquitetura dele prevalece.

## 3. Investigação
Ler o código real ao redor do ponto afetado antes de propor. Seguir a cadeia até
a causa raiz; confirmar a hipótese com query/log (somente leitura) antes de tocar
no código. Fontes da verdade de runtime: banco > logs > código > o que o usuário
acha que viu. Discordância → investigar a discordância primeiro. (A issue é a
verdade do PLANO; banco/logs/código são a verdade do ESTADO.) Dizer abertamente
se a hipótese do usuário está certa ou errada.

## 4. Testes — TDD, duas fases, profundidade pelo risco
TESTES SÃO ESCRITOS ANTES DO CÓDIGO e validados depois. Nunca criar código sem
teste. Duas fases nesta ordem:
- **Fase 1 (funcionamento):** sucesso + erros + bordas reais (malformado, limites,
  vazio, extremos). Só passa pra Fase 2 depois que esta passa.
- **Fase 2 (prova de fogo):** atacar para quebrar — concorrência, exaustão de
  recurso/memória, overflow, injeção, volume de entradas malformadas.
Profundidade escala com o campo `Risco` da tarefa:
- **Trivial** (texto/log/estilo): smoke boot + caso principal.
- **Lógica:** Fase 1 completa + prova de fogo nos pontos de risco.
- **Sensível** (auth, sessão/token, entrada de usuário, dinheiro, dados pessoais,
  upload, query dinâmica): as duas fases + auditoria da seção 6.
- **Multi-sistema:** testar em blocos (A, B, A+B, C, A+B+C).
Testes seguem a convenção do projeto (no contrato do Project); E2E em `e2e/`
com Playwright. Novos testes entram; nunca remover, pular ou enfraquecer os
antigos para fazer passar (isso é REPROVAÇÃO automática).
Cada teste comenta: o que testa, resultado esperado e por quê. Rodar a suíte
completa ao fim de cada bloco. Dado fake de teste é removido ao final por função
de limpeza que apaga só o que aquele teste criou.
**Estado (INVIOLÁVEL):** teste que toca banco, arquivos, fila, cache ou serviço só
roda se o contrato ("Recursos de estado dos testes") provar recurso descartável,
criado pelo próprio teste e exclusivo dele. `localhost`, `.env.test` ou nome com
"test" não são prova. Sem prova → não rodar; `NÃO VERIFICADO` + `precisa-humano`.

## 5. Entrada, escalabilidade e limites
Validar na borda (todo ponto de entrada); o miolo confia em dado já validado. Em
fluxo sensível, defesa em profundidade. Todo texto do usuário é não-confiável:
sanitizar antes de usar. Rate limit em produção, com folga pro crescimento.
Estado derivável pode ser guardado por eficiência, mas validado contra recálculo.

## 6. Segurança — auditoria proporcional
Tirar lógica sensível da mão do LLM: data, fuso, cálculo financeiro → código
determinístico com parâmetros explícitos. Auditoria AppSec formal (severidade,
CWE/OWASP, código vulnerável e corrigido lado a lado, justificativa) só nas
mudanças Sensíveis. Não inventar vulnerabilidade, não gerar exploit, não
reescrever fora do escopo. A correção mantém o comportamento original.

## 7. Git e commits
Micro-commits: um problema coeso por commit. Mensagem explica o PORQUÊ e a causa
raiz, não o diff. Formato: `tipo(escopo): resumo`. Sem emoji, sem Co-Authored-By.
Commit só depois que passou nos testes do nível; mensagem referencia a issue
`(#N)`. Push só da branch da issue e só no modo AUTÔNOMO ATÉ PR do contrato.
(INVIOLÁVEL) Nunca deletar sem confirmar (reset, rm -rf, DROP). Nunca pular hooks
(--no-verify). Nunca merge na main, push, deploy ou efeito externo (e-mail,
WhatsApp) sem autorização explícita.

## 8. Backup e rollback (INVIOLÁVEL)
O loop não toca produção. Qualquer mudança em produção (banco ou código) vira
issue `Bloqueado` + `precisa-humano`. Quando o humano autorizar: backup imediato
com nome explícito (`<projeto>_AAAAMMDD_HHMMSS_descricao`) e rollback descrito na issue.

## 9. Autonomia e dúvidas
Autonomia vale no COMO; o O QUÊ é fixo (não adicionar funcionalidade, log "pra
garantir" ou dependência não pedidos). Perguntas se concentram no começo e no
fim, nunca no meio. Faltou info crítica que o documento não resolve → pular a
tarefa, registrar a pendência na issue (`precisa-humano`), executar o que não depende dela, levar
a dúvida pro fim. Continuidade: o estado vive no GitHub Project, não na conversa.

## 10. Comunicação
Sempre pt-BR. Conciso no operacional, didático no conceitual. Antes de cada
issue: "Issue #N: <título>"; ao concluir: "Issue #N entregue"; em falha:
"Issue #N falhou: <motivo>". Status honesto, em tabela: ✅ feito e testado,
❌ quebrado/rejeitado, ⚠️ pendência. Nunca declarar vitória sem teste — preferir
"precisa verificar" a "funcionou". Sempre revelar o risco que sobrou. Emoji só
✅ ❌ ⚠️ em tabela.

## 11. NUNCA
- Refatorar/embelezar código sem relação com o problema.
- Adicionar funcionalidade, dependência ou log não pedidos.
- Mexer em escopo maior que o autorizado. Viu outro bug? Registra `[ACHADO]`, não toca.
- Confiar em log como estado vivo sem cruzar com banco e código.
- (INVIOLÁVEL) Vazar stack trace, conteúdo técnico interno ou credencial.
- Inventar informação. Faltou base → registrar pendência e perguntar no fim.
