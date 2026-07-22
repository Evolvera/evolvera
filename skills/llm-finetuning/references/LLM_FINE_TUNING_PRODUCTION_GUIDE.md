# Guia de Produção para Fine-Tuning de Extração Semântica de Broker

**Data do documento:** 2026-07-22  
**Status:** guia de pesquisa e decisão; não é autorização de deploy, execução de ordens, abertura de GENERALIZATION ou mutação de APIs externas.

> **Veredito executivo — pare de ajustar o 0,8B atual.** O próximo movimento correto não é trocar learning rate, rank, prompt ou número de épocas. É fechar primeiro os gates de dados, rótulos e proveniência: auditar a cobertura real, adjudicar rótulos críticos, provar independência entre geradores e splits, e congelar um pool futuro-real. O Task97 é estruturalmente válido, porém semanticamente inseguro e reprovado; portanto não pode ser implantado. O 0,8B só volta à experimentação em G5, uma vez concluídos G0–G4. Escalar capacidade antes disso não distingue ausência de evidência de insuficiência do modelo.

## Executive Summary

**FACT — resultado atual.** O Task97 treinou uma base fresca Qwen3.5-0.8B com LoRA BF16, `r=8`, `alpha=16`, learning rate `1e-5`, seed `17`, contexto medido até o contrato de `1984` tokens e `3537` atualizações. Com XGrammar, a saída foi válida em `100/100`, sem saída inválida e sem atingir o cap. Isso não foi suficiente: a acurácia operacional full foi `0,18`, a exatidão de evento `0,59`, a exatidão de ação aproximadamente `0,229`, a exatidão de ação guardada `0`, houve `41` linhas de falsa ação, `38` falsos EXIT e `18` seletores ampliados. O gate passou como `false`. A conclusão de produção é inequívoca: o candidato falha e não pode ser implantado.

**FACT — o que o resultado não significa.** O Task96 foi apenas um smoke test de runtime, sem modelo carregado, treino ou predições: verificou `100/100` correspondências esperadas, `5/5` bases válidas e rejeitou `11/11` probes inválidos. Ele demonstra um fechamento técnico do decoder naquela execução, não capacidade semântica do modelo. Também é facto que o runner atual usa rótulos com perda somente na completion e faz uma geração determinística por linha. Assim, “o prompt foi perdido na loss” não é um diagnóstico suportado; o runner não deve ser falsamente acusado de perda dos tokens do prompt.

**FACT + INFERENCE qualificada — diagnóstico forense.** O V58 mostra uma hipótese forte de cobertura insuficiente: há `3.585` linhas real/source e apenas cinco sintéticas no TRAIN; entre `374` boards reais, `372` são SIGNAL e apenas um é UPDATE. Células críticas reais, incluindo composição de ações, boards com EXIT, guardas e múltiplas ações, estão vazias ou extremamente esparsas; a maior parte da cobertura crítica sintética está concentrada nessas cinco linhas. Os dados indicam uma causa de cobertura e prior, mas não provam que ela seja a causa única. Qualidade dos rótulos, independência dos geradores, capacidade do 0,8B e distribuição de inferência continuam UNKNOWN.

**POLÍTICA DE DECISÃO.** O programa segue G0–G9: (G0) congelar e rejeitar Task97; (G1) auditoria privada de cobertura e rótulos; (G2) provar split, independência de gerador e pool futuro-real; (G3) construir TRAIN canônico, real-heavy, com sintéticos independentemente autorizados e negativos pareados; (G4) estabelecer um teto offline humano/teacher forte, com adjudicação humana; (G5) retreinar uma única vez o 0,8B sob o contrato limpo; (G6) somente se os gates de dados estiverem limpos e persistir uma lacuna de capacidade, comparar primeiro um modelo denso instruct de aproximadamente 4B e depois aproximadamente 8B, sempre com exatamente os mesmos dados, prompt, schema e decoder; (G7) replicar; (G8) abrir uma única vez GENERALIZATION e um holdout real suficientemente dimensionado; (G9) executar shadow futuro-real sem ordens, deixando qualquer canary para autorização explícita posterior.

**LIMITAÇÃO MATERIAL.** “Perfeito” será definido aqui como ausência de erro observada em um produto congelado, com exact match operacional e gates de segurança satisfeitos. Isso nunca equivale a perfeição universal. Mesmo zero falhas em `100` exemplos independentes dá, a 95% unilateral, limite superior de erro de aproximadamente `2,95%`; além disso, rows correlacionadas, shift temporal, erro humano de anotação e contaminação tornam a interpretação mais fraca. NIST recomenda conjuntos realistas, representativos, metodologia documentada e resultados desagregados por segmentos, não um número isolado [6]. O resultado desta pesquisa é uma disciplina para tornar falsificável a próxima decisão, não uma promessa de acurácia futura.

**NÃO AUTORIZA.** Este guia não autoriza abrir GENERALIZATION, promover modelo, executar broker, enviar ordens, mutar Google APIs, publicar dados privados ou reutilizar adapters, predições, mensagens, símbolos, identificadores ou segredos. O harness continua dono de identidade, estado, risco e execução.

## 1. Escopo, definição de “perfeito” e vocabulário de evidência

### 1.1 Objetivo exato

O produto é um extrator semântico privado para uma única chamada de `generate` por entrada. Ele recebe a mensagem corrente e o contexto permitido pelo contrato e emite um único objeto JSON final em inglês, com chaves e enums definidos pelo schema imutável. A saída é uma representação operacional de intenção, não uma ordem de broker e não uma fonte de verdade sobre conta, posição ou risco.

O alvo é simultaneamente:

1. compreender a intenção autorizável da mensagem corrente;
2. manter literalidade, escopo, ordem, guardas e evidência textual;
3. não transformar comentário, histórico, citação, contexto pai ou hipótese em ação;
4. representar `NO_ACTION` quando os factos são úteis mas não autorizam ação;
5. respeitar exatamente o schema, sem pós-processamento que masque erro;
6. entregar ao harness informação suficiente, sem entregar decisões que pertencem a ele.

### 1.2 O que “perfeito” pode e não pode significar

**FACT DE MEDIÇÃO.** Para um dataset congelado, “perfeito observado” significa: cada exemplo recebe um objeto que passa o parse estrito, passa o Draft 2020-12 original, coincide com o alvo canônico no exact match operacional e não produz falsa ação, falso EXIT ou ampliação de selector. Componentes como evento, literal ou guard podem explicar falhas, mas não substituem o exact match.

**INFERENCE DE QUALIDADE.** Esse conceito é útil como gate de release de um produto finito. Ele permite dizer “não observamos erro neste produto, sob esta configuração e este protocolo”, desde que o produto seja independente, seus denominadores sejam publicados e sua proveniência esteja congelada. Não permite dizer “o modelo é universalmente perfeito”.

A perfeição universal é impossível de estabelecer por quatro razões:

- **População aberta:** mensagens futuras podem conter linguagem, composição, ruído, canal ou regime que não existe na amostra.
- **Dependência amostral:** várias mensagens podem ser variações do mesmo thread, autor, template ou episódio; o `n` nominal superestima evidência.
- **Rótulos não são observação perfeita:** humanos podem discordar, o contexto pode ser insuficiente e o schema pode não representar uma distinção semântica. A anotação precisa revelar incerteza, não escondê-la.
- **O sistema muda ao redor do modelo:** tokenizer, versão do decoder, chat template, harness, fontes e distribuição operacional podem mudar. O risco de laboratório pode diferir do risco em operação real [6].

“Perfeito” também não significa que a saída seja verdadeira sobre o mundo externo. JSON Schema define asserções e anotações sobre instâncias; validação do objeto não verifica saldo, identidade da posição, corretagem ou realidade de um preço [9]. XGrammar restringe estrutura, não factualidade ou semântica da tarefa [11].

### 1.3 Marcação obrigatória

Toda afirmação deste guia usa uma das três classes:

- **FACT:** observado no artefato do projeto ou suportado diretamente pela fonte publicada citada.
- **INFERENCE:** conclusão de trabalho derivada dos factos; tem caveat explícito e deve ser testada.
- **UNKNOWN:** não resolvido pelos artefatos; não pode ser apresentado como facto nem usado para justificar escala.

Quando uma recomendação é política do produto, ela é marcada como **POLÍTICA DO PROJETO**. Uma política pode ser mais conservadora que a literatura e não deve ser descrita como resultado publicado.

## 2. Diagnóstico forense atual

### 2.1 Task97: estrutura aprovada, semântica reprovada

| Item | Resultado | Classe | Consequência |
|---|---:|---|---|
| Base | fresca, Qwen3.5-0.8B | FACT do projeto | evita confundir herança de adapter com treino atual |
| LoRA | BF16, `r=8`, `alpha=16`, dropout `0` | FACT do projeto | é a configuração auditada, não uma recomendação universal |
| Otimização | LR `1e-5`, seed `17`, `3537` updates | FACT do projeto | não autoriza concluir que LR/capacidade são causa |
| Decoder | XGrammar `0.1.32`, cap `0` | FACT do projeto | gate estrutural/runtime positivo nesta execução |
| JSON/schema válido | `100/100`; inválido `0` | FACT do projeto | pré-condição, não qualidade semântica |
| Evento exact | `0,59` | FACT do projeto | erro de classificação semântica relevante |
| Operacional full exact | `0,18` | FACT do projeto | falha de produto |
| Ação exact | aproximadamente `0,229` | FACT do projeto | falha de extração acionável |
| Guarded action | `0` | FACT do projeto | célula crítica sem evidência de competência |
| Falsa ação / falso EXIT | `41` / `38` | FACT do projeto | bloqueio de segurança |
| Selector ampliado | `18` | FACT do projeto | violação de escopo/literalidade |

**Conclusão:** `valid=100%` não compensa `operational=0,18` nem falhas de segurança. Não há base para selecionar Task97, abrir GENERALIZATION ou testar execução.

### 2.2 Task96: smoke, não modelo

O Task96 teve `status=PASS` para o smoke técnico, com zero updates, zero losses e zero modelo treinado ou carregado. O runner aceitou `5/5` bases válidas, encontrou `100/100` correspondências esperadas e rejeitou `11/11` valores inválidos. **FACT:** esse é um resultado do decoder e do fechamento de runtime, não uma medição de extração. Não se deve misturar Task96 com um benchmark de modelo nem usar `100/100` como evidência de semântica.

### 2.3 O runner e a hipótese incorreta de perda do prompt

**FACT:** o caminho de treino em `train_unsloth_qwen35_08b_v62.py` renderiza prompt e completion usando o chat template exato, verifica a fronteira tokenizada, rejeita truncamento, mascara os tokens do prompt com `-100` e calcula a loss causal somente nos tokens não mascarados da completion. O caminho de inferência constrói a entrada corrente, chama `model.generate` uma vez por row, com `do_sample=False`, e decodifica apenas os tokens novos.

**POLÍTICA DO PROJETO:** manter completion-only loss. A entrada deve continuar sendo prompt; a saída canônica deve continuar sendo a única completion supervisionada. Testes unitários devem verificar a máscara, mas não se deve “corrigir” uma falha semântica alegando prompt-token loss sem evidência de violação. O que continua UNKNOWN é a suficiência de capacidade, a qualidade de labels, a composição dos dados e a estabilidade CUDA em configurações futuras.

**FACT:** o preflight mede o envelope completo sem `truncation=True`, confere a fronteira e aborta se houver risco. Isso é uma proteção de treino, não uma prova de que o envelope futuro de produção nunca será maior. A cada versão, executar zero-truncation preflight no conjunto real de referência e no envelope operacional medido.

### 2.4 Cobertura V58: evidência forte, causa ainda não provada

O V58 é uma análise agregada e não publica texto privado, símbolos, predições ou envelopes. Seus factos principais são:

- TRAIN tem `3.590` rows: `3.585` real/source e cinco sintéticas.
- Entre `374` boards real/source, `372` são SIGNAL, um é UPDATE e um é NO_ACTION.
- Existem zero exemplos real/source de board com partial+breakeven na combinação crítica; as poucas ocorrências desse board vêm de sintéticos.
- A tabela crítica reporta zero real para board partial+BE nas posições first/middle/last, board guarded, board full EXIT, duas atualizações acionáveis mais proxy neutro e composição de partial+BE com EXIT separado.
- Para o cell board partial+BE com proxy não correspondido/distractor, o TRAIN tem `0 real + 3 sintéticos` e o DEVELOPMENT demanda um caso singleton.
- Há `264` controles real/source não-board partial+breakeven, mas isso não substitui boards reais; a composição e o contexto importam.

**INFERENCE:** o prior de treino pode ensinar que board é quase sempre SIGNAL e que combinações críticas são sintéticas. Isso explica plausivelmente supressão de ações e falhas de composição. **Não é prova de causa única.** O parser de cobertura é deliberadamente conservador e seu baixo mapeamento não permite concluir que linhas não mapeadas sejam neutras. Label quality, generator/source independence, capacidade e inferência permanecem gates abertos.

### 2.5 DEVELOPMENT, GENERALIZATION e adaptatividade

**FACT:** DEVELOPMENT é adaptativo: foi usado para decisões e análises anteriores. Logo, um resultado nele é regressão/desenvolvimento, não generalização independente. **FACT:** GENERALIZATION100 está em estado freeze-only e não foi aberta pelo candidato Task97; a ausência de avaliação do candidato não é um sucesso nem um fracasso estatístico.

**POLÍTICA:** manter GENERALIZATION fechada até que código, prompt, schema, dados, modelo, decoder, thresholds e seeds pré-registrados estejam congelados. Uma vez aberta, usá-la uma única vez por candidato final. Um futuro holdout temporal, por origem e por thread, amostrado de mensagens reais ainda não usadas é obrigatório; uma suite sintética nunca o substitui.

### 2.6 Diagnóstico concorrente

| Hipótese | Evidência a favor | O que ainda falta | Decisão atual |
|---|---|---|---|
| Problema de dados/cobertura | boards reais quase só SIGNAL; cells críticos vazios | auditoria privada e ablação causal | G1–G3 primeiro |
| Problema de rótulo | misturas históricas, contexto e contrato podem divergir | dupla anotação, adjudicação e ledger | G1/G4 |
| Problema de independência | variantes sintéticas podem compartilhar família/template | fingerprints semânticos e autor independente | G2/G3 |
| Problema de capacidade | 0,8B pode falhar em composição após dados limpos | ceiling limpo e comparação controlada | só G6 |
| Problema de optimizer | seed/CUDA e loss não predizem exactness | uma família por vez, replicação | não fazer busca agora |
| Problema decoder/runtime | schema root e integração podem falhar sem constraint | probes diferenciais e runtime exato | Task96 positivo; regressão contínua |

## 3. Contrato de produto e arquitetura alvo

### 3.1 Contrato não negociável

A arquitetura alvo é:

```text
mensagem privada recebida
        |
        +--> ingestão/harness: thread, reply, tempo, identidade, posição, risco, conta
        |
        +--> contexto permitido: current_message + parent/root somente para resolver instrumento/lado
        |
        +--> uma chamada LLM generate, com decoder restrito
        |
        +--> um único objeto JSON final em inglês
        |
        +--> parse estrito + Draft 2020-12 original
        |
        +--> harness aplica estado, risco, quantidade, símbolo de broker, idempotência
        |
        +--> execução somente por política externa e autorização explícita
```

**POLÍTICA DO PROJETO:** uma entrada recebe exatamente uma chamada de `generate`, sem retry, reparo, extração de substring, segunda chamada, modelo auxiliar em runtime ou preenchimento de default. Se o resultado não for uma instância completa e estritamente válida, falha fechadamente e não vira ordem.

O modelo:

- interpreta apenas `current_message` para decidir se existe ação;
- pode usar parent/root para resolver instrumento ou lado quando o contrato permitir;
- preserva literais, typos e abreviações em vez de normalizar criativamente;
- não inventa instrumento, lado, preço, percentual, guard, quantidade ou evidência;
- emite ação somente quando há evidência suficiente no current message e no contexto permitido;
- deixa factos não operacionais sem ação: factos não utilizados devem resultar em `NO_ACTION` conforme o schema;
- para `PARTIAL_CLOSE` sem amount especificado, usa `amount:SOME` conforme o contrato, nunca inventa uma quantidade;
- considera literal de fechamento total mais forte que linguagem de proteção/realização parcial quando o contrato assim define;
- trata blocos multi-asset independentemente, sem ampliar selector de um bloco para outro.

O harness, nunca o modelo, possui:

- resolução de thread e reply;
- identidade de trade e estado da posição;
- risco, quantity e account;
- broker symbol, leverage e qualquer normalização de execução;
- idempotência, deduplicação de ordem, autorização e envio ao broker;
- validação final de permissões, limites e consistência com a conta.

O modelo nunca escolhe `trade_id`, risco, quantidade, conta, broker symbol, leverage ou execução. Esses campos, se existirem no sistema mais amplo, são preenchidos ou validados pelo harness e não devem ser ensinados como decisão livre do LLM.

### 3.2 Facto versus inferência na decomposição

**FACT:** uma saída estruturalmente válida pode ser semanticamente errada. **INFERENCE:** separar o LLM da execução reduz o blast radius de uma interpretação, mas não elimina o risco de falsa ação; a gate operacional ainda deve reprovar qualquer ação indevida. **POLÍTICA:** nenhuma camada downstream pode “consertar” um JSON inválido para fazê-lo parecer uma geração bem-sucedida. A recusa fechada e a revisão humana são preferíveis a uma ordem inventada.

O contexto deve ser compacto. A literatura “Lost in the Middle” encontrou degradação quando a informação relevante fica no meio de contextos longos [14]. Como estado e risco pertencem ao harness, não adicionar narrativas, cálculos ou histórico desnecessário ao prompt para compensar um modelo fraco. Testar posição da evidência, mas não aumentar contexto sem medir truncamento, latência e exactness.

## 4. Aquisição de dados, proveniência e splits

### 4.1 Fonte e privacidade

**POLÍTICA DO PROJETO:** dados de mensagens permanecem privados. O dataset de trabalho deve registrar, em ambiente privado e com controle de acesso, proveniência suficiente para auditoria: período, origem, canal, thread, mensagem corrente, relação de reply, edição, anotador, versão de guideline, estado de adjudicação e hashes. O relatório público contém somente agregados, matrizes, contagens e caminhos de evidência já públicos no repositório. Não copiar mensagens, predições, símbolos, envelopes, IDs ou segredos para documentação, tickets ou experiment receipts públicos.

A documentação de dataset deve registrar composição, processo de coleta, usos recomendados e características operacionais [8]. A coleta deve preservar os bytes necessários para distinguir:

- mensagem corrente de parent/root;
- mensagem original de edição;
- comentário, citação, histórico ou relato de execução;
- um thread de várias ações de episódios independentes;
- texto que contém uma palavra operacional mas não autoriza operação.

Apagar ou normalizar essa distinção antes da anotação cria UNKNOWN irrecuperável. Normalização de execução, por outro lado, é do harness e não deve ser feita no alvo do LLM.

### 4.2 Unidade de split: thread primeiro

**POLÍTICA DO PROJETO:** o grupo indivisível de split é o thread/episódio, não a row. Todas as mensagens do mesmo thread, reply chain, evento de edição e template semântico ligado devem pertencer ao mesmo split. Se uma mensagem corrente depende de parent/root, o grupo contém a cadeia relevante. Não basta hash-deduplicate rows isoladas: isso permite que contexto ou formulação irmã atravesse TRAIN e teste.

Cada grupo recebe campos de controle privados:

| Campo | Obrigatório | Uso |
|---|---|---|
| `thread_group` | sim | impedir vazamento entre splits |
| intervalo temporal | sim | separar passado de futuro |
| origem/canal/família editorial | sim | testar independência |
| estado de edição | sim | evitar duplicata semântica |
| fingerprint de template | sim | remover near-duplicates |
| regime/condição operacional | quando disponível | desagregar shift |
| anotação e versão da guideline | sim | rastrear rótulo |

Os nomes são campos de controle, não saídas do modelo. Sua publicação deve permanecer agregada.

### 4.3 Quatro separações necessárias

1. **TRAIN:** real-heavy, com todos os grupos de treino e sintéticos explicitamente marcados.
2. **DEVELOPMENT:** congelado antes de cada família de experimento; pode ser adaptativo, portanto serve para seleção e regressão.
3. **GENERALIZATION:** temporal/source/thread-disjoint, freeze-only, aberto uma vez depois da configuração travada.
4. **Future-real shadow:** pool posterior, real e independente de todos os artefatos anteriores, decodificado sem ordens; se aberto e usado para tuning, deixa de ser final e deve ser substituído.

A divisão deve separar tempo e origem sempre que houver volume suficiente. Um random split pode ser relatório auxiliar, nunca a única evidência. Uma divisão temporal isolada pode ainda compartilhar o mesmo autor ou template; por isso é necessário o eixo de origem. Uma divisão por origem isolada pode misturar futuro no TRAIN; por isso é necessário o eixo temporal. A unidade thread evita vazamento de contexto.

### 4.4 Real futuro e representatividade

**FACT:** GENERALIZATION100 é freeze-only e unopened pelo Task97. **UNKNOWN:** sua independência linguística, representatividade de produção e independência do gerador não são provadas apenas pelo nome do produto. **POLÍTICA:** construir um future-real pool com seleção determinada antes de olhar rótulos; registrar janela de coleta, canais/origens, regimes e contagens por slice; adjudicar labels sob contrato inalterado; congelar hash e manifest. Não usar DEVELOPMENT wording, predições ou exemplos derivados dele.

A amostra deve conter oportunidades para mensagens de ação e não ação, mas não se deve fabricar uma distribuição “bonita” e depois chamá-la de produção. Manter dois relatórios: (a) suite balanceada para detectar células raras; (b) avaliação calibrada ao prior de produção. A primeira revela defeitos; a segunda estima carga operacional. Nenhuma substitui a outra.

## 5. Anotação e adjudicação

### 5.1 O alvo canônico

Cada row deve ser anotada a partir do texto completo permitido e do contrato, sem inferir fatos que só o broker ou o harness conhece. O alvo canônico precisa registrar, em ambiente privado:

- se a mensagem corrente autoriza alguma ação;
- operação/evento e sequência de ações;
- quais evidências vêm de current, parent ou root;
- instrumento e lado somente quando grounded no escopo permitido;
- literais exatos: números, percentuais, preço, guard e abreviações;
- current versus histórico, intenção versus resultado, comando versus citação;
- ação parcial, total ou nenhuma; amount `SOME` apenas quando a especificação determina;
- escopo por bloco e ordem de ações;
- ambiguidade, insuficiência de contexto e necessidade de abstention prevista pelo schema.

Se a mensagem não fornece vínculo de posição, não inventar. Rotular como irresolúvel ou como a representação de abstention que o schema já prevê. A resolução de trade identity, estado e quantity só ocorre no harness.

### 5.2 Protocolo em duas passagens

**POLÍTICA RECOMENDADA:** cada caso crítico recebe anotação independente de dois anotadores. Primeiro, cada um produz o alvo e marca evidências; depois, um adjudicador revisa apenas os casos em desacordo e uma amostra de acordos. A finalidade não é criar uma estatística ornamental de concordância, mas localizar guideline ambígua e rótulos que excedem o texto.

O adjudicador deve decidir em ordem:

1. a mensagem corrente contém uma instrução ou somente comentário/facto?
2. há negação, condicional, citação, histórico ou resultado passado?
3. há uma ou várias ações e qual é a ordem?
4. cada campo está grounded em texto permitido?
5. parent/root resolve somente o que a política permite?
6. a saída deve ser `NO_ACTION` por falta de evidência?
7. o schema expressa a distinção sem inventar default?

Guardar o desacordo original, a razão da decisão e a versão da guideline. Casos sem resolução não entram silenciosamente como rótulo “conveniente”; entram em quarentena ou numa categoria explicitamente admitida pelo schema.

### 5.3 Teto humano/teacher forte

G4 estabelece um ceiling offline: humanos treinados e, se usado, um teacher forte propõem saídas no mesmo schema; a decisão final é humana e adjudicada. Teacher ou regra é uma fonte de candidatos, não ground truth. Comparar:

- anotador individual;
- consenso humano;
- teacher forte revisado;
- modelo candidato.

Se humanos discordam de forma material numa slice, não se pode usar o score do modelo como se o alvo fosse exato. Revisar guideline, ampliar contexto permitido ou marcar ambiguidade. Um teacher pode ajudar a cobrir paráfrases, mas resultados de instruction tuning sintético em outras tarefas não garantem rótulos financeiros corretos [12][13].

### 5.4 Pares contrafactuais e hard negatives

**FACT publicado:** contraexemplos aumentados por humanos podem alterar uma propriedade mínima para inverter o rótulo sem perder coerência [17]. **INFERENCE:** usar isso como probe de invariância, não como prova de generalização. Criar pares em que uma mudança mínima altera apenas o campo alvo: ação para não ação, EXIT total para partial, selector amplo para escopo estreito, guard presente para ausente. Cada par é revisado por humano; nunca copiar DEVELOPMENT wording.

Hard negatives devem vir de casos reais de falsa ação: “EXIT” em histórico, “action” em comentário, status legado/adaptativo sem comando, citação de instrução insegura ou linguagem de resultado passado. Cada negativo precisa de um positivo pareado quando possível. O objetivo é reduzir dependência lexical, sem ensinar uma lista de palavras como regra.

## 6. Matriz de cobertura semântica

A matriz é uma ferramenta de desenho de dados e testes, não uma prova de suficiência. Exigir que cada célula tenha um denominador conhecido e registrar `real`, `synthetic`, `development`, `generalization` e `shadow` separadamente.

| Dimensão | Slices mínimas | Por que é crítica |
|---|---|---|
| Operação | SIGNAL/OPEN, UPDATE, EXIT total, EXIT parcial, NO_ACTION | separa evento de ação |
| Escopo | current, parent/root resolvendo campo, omitido | impede ação originada fora do current |
| Polaridade | afirmativa, negada, condicional, citação, histórica | reduz falsa ação e falso EXIT |
| Composição | uma ação, duas independentes, ação + neutro, EXIT + partial | testa atomicidade e ordem |
| Guard | stop, target, breakeven, condição composta e ausência | célula de segurança |
| Literalidade | typo, abreviação, preço, percentual, quantidade não especificada | impede invenção/normalização |
| Seleção | escopo estreito, selector explícito, distractor e linha não correspondida | mede broadening |
| Posição | evidência no início, meio, fim; board multi-line | testa atenção posicional |
| Fonte | origem/channel/thread nunca visto | mede independência |
| Tempo | passado, presente, futuro, editado | evita confundir resultado com comando |
| Comprimento | curto, mediano, envelope máximo | detecta truncamento e Lost in the Middle |
| Ambiguidade | contexto suficiente, insuficiente e contraditório | calibra abstention |

### 6.1 Leitura da matriz V58

A cobertura agregada conhecida deve ser preservada como diagnóstico:

| Célula crítica | Real/source TRAIN | Sintético TRAIN | DEVELOPMENT |
|---|---:|---:|---:|
| Board partial+BE com distractor | 0 | 3 | 1 |
| Board partial+BE na primeira posição | 0 | 3 | 1 |
| Board partial+BE na posição do meio | 0 | 0 | 0 |
| Board partial+BE na última posição | 0 | 1 | 0 |
| Board two-action + proxy neutro | 0 | 0 | 0 |
| Board partial+BE separado de EXIT total | 0 | 0 | 0 |
| Board guarded | 0 | 0 | 0 |
| Board EXIT total | 0 | 0 | 0 |
| Board partial | 1 | 4 | 1 |
| Control não-board partial+BE | 264 | 0 | 5 |

**FACT:** os cinco sintéticos não cobrem middle, EXIT, guarded ou duas ações mais neutro. **INFERENCE:** adicionar apenas mais variações cosméticas do mesmo gerador não fecha a matriz. **POLÍTICA:** células críticas reais são não negociáveis para qualquer claim de prontidão; sintéticos podem criar probes e reduzir lacunas, mas nunca provar que o sistema aprendeu a linguagem real.

A matriz deve incluir matched negatives: para cada ação relevante, um caso que mantém vocabulário e muda apenas o status para comentário, histórico, negação ou não autorização. Isso é especialmente necessário para false-action e false-EXIT. O balanceamento da suite de avaliação não deve ser confundido com o prior de produção; ambos devem ser publicados.

### 6.2 Cobertura de origem e gerador

Uma linha com hash novo não é necessariamente independente. V6.1 já mostrou que três variantes do mesmo gerador podem reutilizar clauses, wrappers, literais e estrutura. **POLÍTICA:** TRAIN, DEVELOPMENT e GENERALIZATION devem ter famílias de autoria/geração independentes, catálogos semânticos separados, estilos e ordenações variados. A auditoria remove wrappers e referências antes do fingerprint semântico; testa near duplicates, template overlap e compartilhamento de cláusulas. A independência deve ser demonstrada pelo processo e pela auditoria, não inferida de hash.

## 7. Política de dados sintéticos

### 7.1 O que sintético pode fazer

**FACT publicado:** Self-Instruct relata benefício de instruções sintéticas filtradas por invalidade e similaridade em seus experimentos, mas isso não é demonstração de extração financeira [12]. Dados gerados por teacher forte também podem ajudar instruction tuning em tarefas descritas nos respectivos trabalhos [13].

**POLÍTICA:** sintéticos servem para:

- preencher uma célula já identificada como ausente;
- gerar contrastes mínimos e matched negatives;
- explorar posições first/middle/last, guardas, composição e referências;
- criar probes de propriedade e regressão;
- tornar explícito um caso raro que será depois conferido contra dados reais.

Sintético deve conter provenance `source=synthetic`, família de gerador, versão de guideline e revisão. Nunca entra em relatório como evidência de comportamento real.

### 7.2 O que sintético não pode fazer

Não aceitar automaticamente porque valida no schema. Não produzir rótulos a partir de DEVELOPMENT. Não usar um gerador comum para TRAIN e GENERALIZATION. Não preencher uma matriz toda sintética e chamá-la de cobertura real. Não duplicar a mesma célula três vezes e chamar isso de três exemplos independentes. Não deixar a proporção de `NO_ACTION` artificial dominar o prior sem uma hipótese registrada.

A matriz V6.1 tinha `150` positivos e `150` NO_ACTION sintéticos, aproximadamente `50%` NO_ACTION, enquanto o histórico V5.8 era aproximadamente `25%`. **FACT:** a mudança coincidiu com retenção de ações positivas pior, sem provar causalidade isolada. **INFERENCE:** peso de polaridade e retenção histórica precisam de ablação. O runner permite peso de completion para positives sintéticos, mas o peso deve ser escolhido antes da avaliação, não ajustado após ver o resultado.

### 7.3 Mistura e calibração

**STARTING HYPOTHESIS, não facto universal:** começar com exposição balanceada das cells raras durante aprendizagem, mantendo reais como maioria efetiva e synthetics marcados; em seguida calibrar para o prior de produção num produto separado. Não há proporção ótima publicada para Telegram trading extraction. Testar real-only, sintético controlado, mistura real-heavy e peso de positivos em famílias de até três execuções. O resultado deve reportar tanto suite balanceada quanto prior de produção.

## 8. Serialização canônica e prevenção de leakage

### 8.1 Serialização

O alvo deve ser um único objeto JSON canônico, sem texto explicativo, em inglês JSON e enums. Definir e versionar uma ordem de chaves estável, representação de números, escaping Unicode, tratamento de `null` versus campo ausente e formato de arrays. A ordem não muda a semântica do JSON, mas uma serialização estável reduz ruído de loss e torna hash/receipts reprodutíveis. O parser deve rejeitar chave duplicada; o Draft 2020-12 observa que comportamento de documento com chave duplicada é indefinido e detalhes lexicais não são o escopo da validação [9].

**POLÍTICA:** a canonicalização de comparação ocorre depois de parse estrito e antes do exact match, sem apagar uma diferença semântica. Não reordenar ou preencher campos para resgatar uma previsão inválida. O alvo de treino e a saída avaliada passam pela mesma serialização canônica. O schema original permanece congelado; qualquer gramática compilada é derivada e tem hash próprio.

### 8.2 Leakage ledger

Antes de cada treino, gerar um ledger privado que verifique:

- zero exact reuse de envelope/corrente de DEVELOPMENT;
- zero texto de predição em TRAIN;
- zero acesso a GENERALIZATION e shadow;
- zero thread group cruzando split;
- zero near duplicate acima do limiar decidido antes da inspeção;
- zero cláusula crítica compartilhada entre gerador de TRAIN e GENERALIZATION;
- zero alvo de avaliação usado como exemplo de prompt;
- hash de código, schema, prompt, tokenizer, dataset, lineage e modelo;
- ausência de truncamento;
- proteção de acesso owner-only.

Literals de domínio isolados não são leakage; texto integral, estrutura envelope e formulação próxima podem ser. O ledger deve produzir agregados públicos, preservando evidência detalhada em local privado.

## 9. Escada de capacidade

A escada é causal apenas se dados e rótulos estiverem limpos. Não existe evidência suficiente para declarar que 0,8B é definitivamente a raiz atual.

### G5 — retreino controlado do 0,8B

Retreinar uma única configuração Qwen3.5-0.8B sob o dataset canônico, real-heavy e splits fechados. Manter completion-only loss, chat template/EOS exatos, uma geração determinística, schema original e decoder aprovado. A configuração histórica Task97 é um ponto de comparação, não uma prescrição de que seus hiperparâmetros sejam ótimos. Medir sem truncamento e reportar loss apenas como diagnóstico.

### G6 — aproximadamente 4B, só após gate de dados

Se, com rótulos adjudicados, cells reais presentes, geradores independentes, decoder correto e zero problemas de distribuição, o 0,8B ainda falhar em composição, coreferência ou guardas, comparar um único candidato denso instruct aproximadamente 4B. Manter exatamente o mesmo TRAIN, prompt, schema, tokenizer/contrato de saída, budget de geração e avaliação. Fazer benchmark local de VRAM, OOM, prefill, decode e p50/p95 antes de treino completo. Nenhum fit de GPU é afirmado neste guia.

QLoRA pode ser usado como tratamento de viabilidade de memória, pois treina adapters através de um modelo base quantizado congelado [5]. Isso não é uma suposição de melhora de acurácia. As alegações de fornecedor sobre VRAM e velocidade não substituem medição local [19].

### G7 — aproximadamente 8B, se o 4B ainda for insuficiente

Somente se 4B passar pelos gates de dados e runtime, mas mantiver uma falha de capacidade reproduzível, testar aproximadamente 8B com o mesmo contrato. Não mudar simultaneamente mix, prompt, decoder, seed ou schema. Se 8B melhorar média mas piorar false-action, false-EXIT, literal ou guard, rejeitar.

### Regras da escada

- Não subir degrau para compensar label error ou coverage EMPTY.
- Não alegar que maior é melhor por InstructGPT: o resultado publicado é de instruction following amplo e envolve etapas de demonstração/preferência, não esta extração determinística [13].
- Não inventar card, VRAM exata ou capacidade do checkpoint Qwen3.5-0.8B.
- Rank maior pode aumentar capacidade treinável, mas também overfit e não cria exemplos ausentes [3].
- Selecionar pelo vetor operacional e pela replicação, nunca por loss menor.

## 10. Receita de treinamento aprovada

### 10.1 Base fixa

**POLÍTICA:** SFT é o método inicial adequado para ensinar respostas corretas em formato fixo e tarefas de classificação/extraction [1]. O dataset é prompt-completion: prompt contém somente o contexto permitido; completion contém o objeto final. TRL documenta loss apenas na completion para prompt-completion [2].

A receita mínima é:

1. validar schema e canonical serializer antes do treino;
2. validar lineage de cada occurrence e hash do row;
3. renderizar com o chat template exato do modelo;
4. verificar EOS alinhado ao template; TRL alerta que modelos Qwen precisam dessa compatibilidade para terminar corretamente [2];
5. tokenizar sem truncamento e abortar se qualquer row exceder contexto;
6. mascarar prompt com `-100`, deixando completion ativa;
7. fazer SFT com LoRA/PEFT para ablações rápidas; LoRA congela pesos base e treina matrizes low-rank [4];
8. registrar updates, losses, config, seeds, hashes e receipt;
9. avaliar sem modificar prompt, alvo ou saída;
10. salvar adapter privadamente, com acesso owner-only, sem incluí-lo neste guia.

### 10.2 Loss e hiperparâmetros

Manter completion-only. Se houver weights de rows sintéticos, aplicá-los somente aos tokens ativos da completion, nunca ao prompt. O denominator ativo deve ser registrado. Testar a implementação com uma row mínima e uma máscara conhecida.

**POLÍTICA:** um family experiment muda uma variável: data retention/weight, mistura/polaridade, diversidade, learning rate, scheduler, rank/target modules, epoch rule, prompt ou modelo. Não cruzar famílias. Até três runs por família são um limite de busca do projeto, não uma lei estatística. Seeds adicionais só quando pré-registradas para estimar variância; não selecionar a mais conveniente.

Não usar train loss como proxy de qualidade. O histórico local mostra uma configuração com loss menor e regressão semântica; isso é evidência direta contra o proxy, não uma teoria de otimização geral. Reportar loss junto de exact match, safety e slices.

### 10.3 Contexto, EOS e geração

O chat template é artefato do modelo e deve ser hash-bound. Testar `enable_thinking=False` como baseline do runner atual, porque o contrato exige uma saída final e uma chamada; um modo de raciocínio adicionaria tokens e superfície de vazamento. Se um candidato usar outro modo, isso é uma variável registrada e precisa de medição. Não inserir chain-of-thought no schema, no dataset ou no relatório.

A geração deve ser determinística, sem sampling, uma chamada e um objeto. `max_new_tokens` é cap de segurança, não motivo para aceitar truncamento. Se cap for atingido, registrar falha e não tentar outra chamada.

### 10.4 DPO/RL

Não usar DPO, RL ou preference optimization antes de um baseline SFT semanticamente competente e de dados de preferência adjudicados. DPO é descrito como uma loss de preferência simples em seus trabalhos, mas a evidência é de alinhamento geral, não de extração financeira [20]. Um par “saída aceita versus saída rejeitada” só é útil depois de verificar que a preferência é semântica e grounded. Preference training não corrige ground truth ausente nem autoriza relaxar o schema.

### 10.5 Model card e data card

Cada candidato deve ter um **model card** privado e uma projeção agregada: finalidade e não-finalidade; base e revisão; precisão/quantização; LoRA e treino; prompt, schema, tokenizer e decoder hash-bound; datasets e splits; métricas por slice; limites conhecidos; incidentes; latência/VRAM local; licença; status de promoção, shadow e rollback. Declarar explicitamente que não escolhe trade identity, risco, quantity, account, broker symbol, leverage ou execution.

Cada produto de dados deve ter **data card**: motivação; composição real/synthetic; período e origem agregados; política de thread split; anotação/adjudicação; coverage matrix; near-duplicate e leakage audit; incerteza de labels; usos recomendados e proibidos; retenção, privacidade e permissões; hashes; e regra de substituição quando GENERALIZATION ou shadow são abertos. Nenhum card inclui mensagem, predição, símbolo, ID, label privado, adapter ou segredo. Datasheet recomenda documentar composição, coleta e usos [8].

## 11. Protocolo experimental e DAG de decisão

### 11.1 Contrato de receipt

Todo experimento deve ser pré-registrado com:

```text
ID e data:
FACT / INFERENCE da hipótese:
Uma única variável alterada:
Constantes preservadas:
Dataset, lineage, prompt, schema, tokenizer, modelo e decoder:
Split usado para seleção:
Seed(s) e motivo:
Configuração de treino e geração:
Preflight de tokens e cap:
Métricas primárias e slices:
Gates de segurança:
Critério de avanço/rejeição:
Orçamento restante da família:
Resultado agregado, receipt e SHA256:
Decisão e próxima ação:
```

A receipt nunca contém mensagem privada, predição bruta, símbolos, IDs, secrets ou adapter. Uma receipt pública contém somente agregados e hashes autorizados.

### 11.2 Template de receipt final

```text
Status: COMPLETE | BLOCKED | REJECTED | ADVANCES
Atualização/erro/cap: agregados por split e slice
Exactness e safety: numeradores, denominadores, bounds
Runtime: versão, schema/grammar hash, latência, VRAM
Reprodução: resultado e divergências
Decisão: conservar, rejeitar ou avançar; justificativa
```

O pré-registro vem antes da execução; a receipt vem depois. Nunca preencher uma receipt retroativamente para transformar uma exploração adaptativa em experimento causal.

### 11.3 DAG

```text
G0 congelar/rejeitar Task97
        |
G1 auditoria privada de coverage + labels
        |
G2 splits thread/time/source + independence + futuro-real
        |
G3 TRAIN canônico real-heavy + synthetic independente + matched negatives
        |
G4 ceiling humano/teacher forte offline, human-adjudicated
        |
G5 uma configuração limpa do 0,8B
        |
        +--> falha por dados/rótulo/runtime --> corrigir o gate correspondente, não escalar
        |
        +--> zero-invalid mas semântica ainda baixa, evidência limpa
                       |
                 G6 comparar ~4B, mesmo contrato
                       |
                 ainda incapaz? --> G7 ~8B, mesmo contrato
                       |
                 selecionado --> replicação exata
                       |
                 G8 abrir uma vez GENERALIZATION + holdout real dimensionado
                       |
                 aprovado --> G9 shadow futuro-real, sem ordens
                       |
                 só depois de revisão e autorização explícita --> canary possível
```

### 11.4 G0–G9 executável

**G0 — freeze/reject.** Marcar Task97 como candidato falho; conservar evidência agregada; não abrir GENERALIZATION; não promover e não treinar contra o resultado.

**G1 — audit.** Auditar ocorrência, contrato histórico, mistura `current/parent/root`, rótulos, fields grounded, ambiguidade, duplicata e cells críticas. Quarentenar desacordos; não reescrever silenciosamente real data.

**G2 — independence.** Construir splits por thread, tempo e origem; provar que gerador e autor de GENERALIZATION não compartilham catálogo/cláusula com TRAIN/DEVELOPMENT; separar um pool futuro-real antes de ver labels.

**G3 — clean data.** Construir TRAIN com real crítico não negociável, sintéticos tagueados independentemente, matched positives/negatives e serializer único. Balancear rare cells sem alegar que o balanceamento é produção.

**G4 — ceiling.** Human/teacher forte gera referência offline; adjudicar conflitos; medir ceiling por slice e registrar onde o próprio contrato é ambíguo.

**G5 — 0,8B.** Uma execução limpa, com exatamente o runner e o contrato. Aceitar somente se semanticamente competente e sem falha de safety.

**G6 — 4B.** Só se G5 falhar com evidência limpa de capacidade; benchmark local primeiro; mesmo tudo restante.

**G7 — 8B.** Só se o 4B falhar pela mesma limitação reproduzível; nenhuma promessa de ganho.

**G8 — final evidence.** Selecionar, replicar, congelar, abrir GENERALIZATION uma vez e avaliar um real holdout com denominadores suficientes. O resultado continua sendo evidência amostral.

**G9 — shadow.** Rodar futuro-real sem enviar ordens; comparar com humanos/harness legado; registrar incidentes e drift. O canary requer autorização explícita, política de execução e kill switch independente.

### 11.5 Matriz de decisão de causa

| Padrão observado | Problema mais provável | Teste confirmatório | Ação | O que não fazer |
|---|---|---|---|---|
| célula crítica EMPTY/real zero | dados/cobertura | adicionar real source-disjoint e learning curve | G1–G3 | aumentar rank |
| humanos discordam ou campo não está no texto | label/contrato | dupla anotação e adjudicação | guideline/quarentena | treinar rótulo inventado |
| synthetic score alto, real holdout baixo | generator/independência | real-only versus mix, family-disjoint | reescrever geradores | chamar synthetic de prova |
| dados limpos, erros reproduzíveis em composição/guard | capacidade | mesma receita em ~4B | G6 | declarar 0.8B raiz antes |
| variação entre mesmas configs | optimizer/runtime | replicação e deterministic controls | estabilizar/medir | cherry-pick seed |
| invalid/oneOf/cap/EOS | decoder/runtime | probes diferenciais, tokenizer e schema hash | corrigir runtime | parser repair/retry |
| schema 100%, semantic baixo | conteúdo/dados/capacidade | full exact e slices | voltar a dados/ceiling | usar validade como proxy |

A matriz produz hipótese, não causalidade automática. Toda conclusão forte requer mudar uma variável e repetir em split não adaptativo.

## 12. Decodificação restrita e contrato de runtime

### 12.1 Dois gates distintos

**FACT publicado:** XGrammar declara constrained decoding para correção estrutural [11]. **FACT do projeto:** XGrammar `0.1.32` produziu `100/100` válidos e zero cap no Task97, enquanto semântica falhou. **INFERENCE:** estrutura é necessária, mas não suficiente; manter gates separados:

1. estrutural: output completo, parse estrito, sem duplicata, estado aceitante, validação no Draft 2020-12 original;
2. semântico-operacional: exact match, grounding, ação, segurança, literalidade, escopo, ordem e slices.

O schema Draft 2020-12 original é imutável e único validador final. A gramática compilada para XGrammar é um artefato de decoding. Sua equivalência deve ser testada diferencialmente, nunca presumida. Não relaxar `oneOf`, enums, required, arrays, referências ou limites para fazer uma saída passar.

### 12.2 Uma chamada, uma saída, falha fechada

O runtime aprovado é:

1. carregar modelo, processor, tokenizer e schema com hashes;
2. compilar o decoder antes de gerar;
3. renderizar somente o prompt permitido e obter generation prompt;
4. fazer uma chamada `generate` com máscara de grammar a cada passo;
5. aceitar EOS somente se o estado da grammar for aceitante;
6. rejeitar cap, JSON parcial, texto extra, chave duplicada, parse frouxo ou schema inválido;
7. validar o texto completo no Draft 2020-12 original;
8. encaminhar o objeto ao harness, que ainda aplica todas as políticas.

Proibidos: retirar fences, procurar substring JSON, corrigir aspas, fazer parser repair, preencher defaults, normalizar campos ausentes, retry automático, segundo modelo ou segunda chamada. Uma saída rejeitada é uma falha mensurável. XGrammar não transforma uma intenção errada em correta.

### 12.3 Suíte de release do decoder

Para cada mudança de XGrammar, Transformers, tokenizer, modelo, schema ou processor, executar probes válidos e inválidos:

- cada ramo de unions aninhadas e ramos sobrepostos;
- required ausente, propriedade extra, enum/const errado e tipo errado;
- null versus ausente;
- arrays nos limites;
- Unicode escapado e números nas bordas;
- `$ref`/recursão aplicáveis;
- chave duplicada;
- JSON truncado e EOS cedo;
- cap um token antes e depois do fechamento válido.

Registrar contagens, motivo de parada, número de tokens, estado aceitante, hash do schema original e compilado e resultado do validador original. LM Format Enforcer `0.11.3` foi reportado como unsound para unions aninhadas neste caso; não usar para o schema sem nova suíte de aprovação. Essa conclusão é limitada ao caso testado, não uma condenação universal de versões futuras.

O Transformers documenta que `LogitsProcessor` altera scores durante `generate` e que beam search pode exigir normalização posterior [10]. Como o produto exige geração determinística de uma chamada, evitar combinações desnecessárias de beam/warper. Se alguma configuração mudar, testar a ordem efetiva da máscara e do processor.

## 13. Avaliação, severidade e estatística

### 13.1 Autoridade das métricas

**Métrica de autoridade:** operational full exact, isto é, o objeto inteiro coincide com o alvo canônico e passa todos os gates. Componentes diagnosticam; não podem esconder falha de safety.

| Família | Métrica | Severidade |
|---|---|---|
| Estrutural | parse, schema-valid, estado aceitante, cap, duplicata | bloqueadora quando falha |
| Evento | event exact/F1 e matriz de confusão | alta |
| Operacional | full exact e sequência exata | crítica |
| Ação | precision, recall, F1; action-set exact | crítica |
| Segurança | false-action, false-EXIT, selector broadened | bloqueadora |
| Literal | preço, percentual, typo, abreviação, amount | alta |
| Guard | presença, tipo, valor e vínculo | crítica |
| Grounding | current versus parent/root e evidência de campo | crítica |
| Composição | atomicidade, ordem e ações independentes | crítica |
| Seletiva | abstention/NO_ACTION, coverage e risco condicional | política de segurança |
| Runtime | p50/p95 end-to-end, prefill/decode, VRAM, OOM, cap | release |

Action precision/recall/F1 são úteis, mas uma alta média pode ocultar um falso EXIT. Reportar exact match por campo, mas nunca substituir a saída integral. O sistema deve reportar quantos casos eram elegíveis para cada métrica; sem denominador, `0/0` não é zero erro.

### 13.2 Slices obrigatórias

Para cada métrica e gate, publicar `n`, numerador, denominador e intervalo quando aplicável por:

- role/event: SIGNAL, UPDATE, EXIT, NO_ACTION;
- mode: current, parent, root, omitted;
- polarity: afirmativa, negada, condicional, citação, histórico;
- fonte, canal, thread family e janela temporal agregadas;
- curta/longa e posição inicial/meio/final;
- board de uma ou várias linhas;
- single/multi-action;
- guard presente/ausente e tipo de guard;
- literal explícito/omisso/typo;
- real versus synthetic;
- ambiguous/clear;
- oportunidade de falsa ação e oportunidade de falso EXIT.

Célula vazia é `UNKNOWN`, não zero. Uma slice com uma observação não sustenta `Alta`. A suite de cobertura é deliberadamente balanceada; o relatório de produção usa adicionalmente prior real, sem apagar a suite diagnóstica.

### 13.3 Selective abstention

**FACT publicado:** selective classification permite trocar coverage por menor risco usando reject option [15]. **INFERENCE:** se o schema já oferece uma representação segura de não ação/insuficiência, calibrar abstention no DEVELOPMENT para reduzir false-action e false-EXIT, e medir o custo em recall. Não criar campo novo nem relaxar schema.

**POLÍTICA:** abstention não pode mascarar incompetência: reportar coverage, risco condicional, recall de ações obrigatórias e distribuição por slice. Se o modelo simplesmente converte toda ação em NO_ACTION, false-action cai mas o produto falha por omissão. O gate deve exigir piso de cobertura/recall predefinido e zero observações de safety violation no produto correspondente. Não escolher threshold depois de abrir GENERALIZATION.

### 13.4 Teste de cobertura e propriedades

Coverage-driven testing foi proposto para revelar comportamentos raros que datasets rotulados manuais podem não cobrir [16]. Aqui o equivalente é uma matriz semântica de texto, não alegação de neuron coverage. Gerar offline transformações label-preserving e label-changing, revisar amostras humanas e verificar:

- mudanças irrelevantes não alteram o objeto;
- negação/temporalidade alteram somente o alvo esperado;
- adicionar linha neutra não amplia ação de outra linha;
- mover evidência entre início/meio/fim preserva semântica;
- parent/root resolve campo mas não cria evento;
- uma ação parcial sem amount continua `SOME`;
- selector não inclui distractor.

Uma violação é diagnóstico, não necessariamente erro do dataset; revisar a relação metamórfica com humano.

### 13.5 Latência e memória

Medir no hardware local efetivamente usado, sem extrapolar alegações de fornecedor: prefill tokens/s, decode tokens/s, p50/p95 da chamada completa, pico de VRAM, OOM, cap hit e custo de compilação. Comparar exatamente o mesmo prompt e tamanho de saída entre candidatos. Um modelo que melhora semanticamente mas viola p95, estabilidade ou isolamento não passa o runtime gate. Nenhuma afirmação de que determinado modelo cabe na GPU é feita antes do benchmark local.

## 14. Limites de confiança e amostra

Para zero falhas observadas em `n` ensaios independentes Bernoulli, o limite superior unilateral de erro a 95% é:

```text
upper_error = 1 - 0,05^(1/n)
```

Para planejar um gate de zero falhas com erro verdadeiro alvo `t`, resolver:

```text
n >= ceil( ln(0,05) / ln(1 - t) )
```

| Erro alvo máximo | n mínimo, zero falhas, unilateral 95% |
|---:|---:|
| 1% | 299 |
| 0,5% | 598 |
| 0,1% | 2.995 |
| 0,05% | 5.990 |
| 0,01% | 29.956 |

**FACT estatístico:** métodos binomiais exatos são apropriados quando há poucos failures ou amostra pequena [7]. **INFERENCE:** `0/100` não significa erro verdadeiro zero; sob as hipóteses ideais, o limite é aproximadamente `2,95%`. `0/1.000` é aproximadamente `0,30%` a 95%. Para uma slice rara com `n=10`, `0/10` ainda permite limite superior de cerca de `25,9%`.

Assumptions obrigatórias: oportunidades independentes, mesma população alvo, definição correta de erro e label sem erro. Rows do mesmo thread, autor ou template são correlacionadas; o denominador nominal deve ser acompanhado do número de grupos independentes ou de uma análise de effective sample size. Distribuição temporal futura pode não ser IID. Se a slice contém apenas uma parte das rows capaz de gerar falsa ação, usar o denominador de oportunidades de falsa ação, não o total geral.

Para failures não zero, usar intervalo binomial exato ou método pré-registrado; não escolher Wilson, normal ou bootstrap depois de ver o resultado. Reportar intervalos por slice. “Alta confiança” exige pelo menos duas fontes independentes para uma afirmação publicada quando aplicável, e neste projeto exige também evidência operacional independente; uma única suite adaptativa não merece o rótulo.

## 15. Promoção, replicação, shadow, canary e rollback

### 15.1 Gate de candidato

Um candidato só pode avançar se, no produto de desenvolvimento selecionado antes de GENERALIZATION:

- schema-valid e parse estrito sem falha;
- operational full exact atingir a meta pré-registrada;
- false-action, false-EXIT e broadened selector permanecerem zero observado;
- todas as slices críticas tiverem denominador adequado e não houver cell crítica UNKNOWN escondida;
- não houver truncamento ou cap;
- a configuração e hashes estiverem completos;
- não houver regressão no histórico de regressão permitido.

Como o atual Task97 tem `41` falsas ações, `38` falsos EXIT e `18` broadened, não passa.

### 15.2 Replicação

Reexecutar a configuração congelada em workspace novo, com os mesmos bytes, seed e decoder. Comparar vetor inteiro, safety, loss e taxonomy agregada. Se CUDA apresentar nondeterminism, pré-registrar a regra de replicação/maioria; nunca escolher uma execução favorável. Uma replicação que falha rebaixa a confiança e bloqueia shadow até nova hipótese e novo registro.

### 15.3 GENERALIZATION e holdout

Congelar código, prompt, schema, modelo, tokenizer, decoder, thresholds e lista de seeds antes de abrir GENERALIZATION. Abrir uma vez. Nenhum failure de GENERALIZATION pode ser convertido em novo treino e continuar sendo a mesma evidência. Para outra tentativa final, construir um novo produto independente.

Amostra de `100` pode funcionar como smoke/regression, mas não como prova estatística de baixa taxa rara. O futuro-real holdout deve ser suficientemente dimensionado de acordo com a taxa de safety que se pretende excluir, usando a tabela e denominadores por oportunidade.

### 15.4 Shadow sem ordens

G9 roda em paralelo, sem mutação de estado de broker e sem enviar ordens. Comparar saída do extrator com decisões humanas/harness legado, com adjudicação posterior. Monitorar:

- schema invalid, cap, parser exception e abstention;
- falsa ação e falso EXIT descobertos na revisão;
- selector broadening, literal e guard;
- drift de classe, origem, comprimento e posição;
- latência, VRAM, fila e timeouts;
- incidentes e divergências de contrato;
- qualquer conteúdo privado nos logs.

O shadow só pode ser chamado “futuro-real” com ledger de exclusão de TRAIN/DEV/GENERALIZATION e data de coleta. Não usar seus resultados adaptativamente sem invalidar a finalidade final.

### 15.5 Canary e rollback

Canary não é consequência automática de shadow. Requer decisão explícita posterior, revisão de risco, kill switch, idempotência e limites do harness. O LLM não recebe autorização de execução. Rollback deve ser selecionar a última configuração privada aprovada pelo harness e desligar o candidato; não deve depender de um segundo modelo ou reparo. Critérios de rollback pré-registrados incluem qualquer falsa ação confirmada, falso EXIT, broadening, schema failure, drift material, p95/VRAM fora do budget ou incidente de privacidade.

## 16. Anti-pattern blacklist

1. **Ajustar o 0,8B atual imediatamente:** bloqueado; dados e labels ainda não fecharam.
2. **Dizer que schema-valid 100/100 é semântica perfeita:** falso.
3. **Usar Task96 smoke como accuracy:** falso.
4. **Diagnosticar prompt-token loss sem teste de máscara:** falso; runner já faz completion-only.
5. **Abrir GENERALIZATION para escolher uma config:** proibido.
6. **Treinar em wording de DEVELOPMENT ou em predição anterior:** leakage.
7. **Criar sintético no mesmo gerador de TRAIN e chamar holdout independente:** inválido.
8. **Usar hash disjunto como prova de independência linguística:** insuficiente.
9. **Aumentar rank para preencher cell real vazia:** sem nexo causal.
10. **Declarar 0,8B como causa antes de G4/G5:** não suportado.
11. **Usar loss menor como qualidade:** contrariado pela evidência local.
12. **Usar random row split em vez de thread/time/source split:** vazamento provável.
13. **Preencher default, inventar lado/instrumento, normalizar typo ou ampliar selector:** viola contrato.
14. **Pós-processar JSON parcial, extrair substring ou reparar parser:** invalida o gate.
15. **Retry ou segunda chamada para obter JSON:** viola one-call.
16. **Enviar estado, risco, account, quantity ou símbolo de broker para decisão do modelo:** arquitetura errada.
17. **Permitir parent/root disparar ação:** viola current-message-only.
18. **Chamar `NO_ACTION` universal de segurança:** omissão operacional também é falha.
19. **Usar um teacher como verdade sem adjudicação:** rótulo potencialmente errado.
20. **Rodar DPO/RL antes de SFT semanticamente competente:** prematuro.
21. **Usar claims de VRAM de vendor como benchmark local:** não verificado.
22. **Somar todos os tokens de rows correlacionadas como n independente:** intervalo enganoso.
23. **Publicar mensagens, símbolos, IDs, predições, adapters ou paths privados:** proibido.
24. **Mutar schema para transformar previsão em acerto:** proibido.
25. **Fazer canary apenas porque um benchmark deu 100/100:** insuficiente.

## 17. Checklist imediato ordenado

### G0 — hoje

- [ ] Marcar Task97 como reprovado; preservar receipt agregada.
- [ ] Não promover, não executar, não abrir GENERALIZATION.
- [ ] Separar semantic gate de runtime smoke Task96.
- [ ] Confirmar que a máscara completion-only e uma geração por row permanecem no runner.

### G1 — auditoria privada

- [ ] Gerar cobertura por operação, guard, composição, posição e grounding.
- [ ] Revisar contrato histórico, rows ambíguas e misturas current/parent/root.
- [ ] Fazer dupla anotação e adjudicação dos critical cells e falhas históricas.
- [ ] Criar ledger de near duplicates, edição, thread e leakage.

### G2 — independência

- [ ] Agrupar por thread/episódio.
- [ ] Separar tempo, fonte, canal e família editorial.
- [ ] Provar geradores e catálogos distintos para TRAIN/DEV/GENERALIZATION.
- [ ] Selecionar e congelar futuro-real antes de inspecionar labels.

### G3 — dados

- [ ] Adicionar real critical cells, incluindo board, guarded, EXIT e multi-action.
- [ ] Criar matched negatives reais quando possível.
- [ ] Taggear cada sintético e auditar humanos nos casos de impacto.
- [ ] Fixar serializer, prompt, schema e lineage.
- [ ] Calibrar mistura balanceada versus prior de produção como hipóteses separadas.

### G4 — ceiling

- [ ] Medir teto humano/teacher em suite offline adjudicada.
- [ ] Resolver ou quarentenar desacordos.
- [ ] Definir metas de segurança e coverage antes de treino.

### G5–G7 — modelo

- [ ] Retreinar uma vez o 0,8B com contrato limpo.
- [ ] Se falha semântica persistir com dados limpos, benchmark local do ~4B.
- [ ] Só então considerar ~8B.
- [ ] Usar QLoRA apenas como tratamento de feasibility; medir qualidade separadamente.
- [ ] Manter prompt/schema/decoder/splits iguais entre degraus.

### G8–G9 — evidência e operação

- [ ] Replicar configuração selecionada em workspace novo.
- [ ] Congelar e abrir GENERALIZATION uma única vez.
- [ ] Avaliar holdout real com n e slices adequados.
- [ ] Rodar shadow futuro-real sem ordens.
- [ ] Revisar monitoramento, kill switch e rollback.
- [ ] Pedir autorização explícita antes de qualquer canary; este documento não concede autorização.

## 18. Stop rules

Parar e marcar `BLOCKED_NEEDS_USER_DECISION` quando:

- a família pré-registrada esgotar o orçamento sem melhoria Pareto;
- duas execuções regressarem sem nova hipótese respaldada;
- a continuação exigir mudar schema, significado de label, current-message boundary ou harness ownership;
- não houver pool futuro-real sem sobreposição;
- houver failure de segurança, mesmo com schema válido;
- houver truncamento, cap, decoder não equivalente ou EOS não aceitante;
- a replicação não reproduzir o resultado;
- a avaliação exigir abrir sealed ou GENERALIZATION adaptativamente;
- houver necessidade de credencial, deploy, execução destrutiva ou mutação de API externa.

Stop rules também valem positivamente: não continuar procurando ganho em média quando as gates críticas já falharam; não converter uma falha descoberta no mesmo benchmark em treino e depois apresentá-la como validação independente.

## 19. Definition of Done

O trabalho só está concluído para uma decisão de produção quando todos os itens forem verdadeiros:

- [ ] Task97 permanece rejeitado e a causa não foi exagerada além da evidência.
- [ ] Cobertura real, labels e ambiguidade foram auditados e adjudicados.
- [ ] Thread, tempo, origem e generator independence foram provados por ledger.
- [ ] TRAIN canônico é real-heavy; sintéticos são taggeados, filtrados e nunca tratados como prova.
- [ ] Critical cells reais não estão vazias para a claim feita.
- [ ] DEVELOPMENT é explicitamente adaptativo.
- [ ] GENERALIZATION está fechada até a configuração final e é aberta no máximo uma vez por candidato.
- [ ] Existe holdout future-real source/thread/time-disjoint com amostra e denominadores adequados.
- [ ] Ceiling humano/teacher foi medido com adjudicação.
- [ ] SFT completion-only, chat template/EOS e zero truncation foram testados.
- [ ] Uma chamada `generate` por input e um único objeto JSON final foram demonstrados.
- [ ] Schema Draft 2020-12 original é imutável e validação final ocorre nele.
- [ ] XGrammar/decoder passou probes diferenciais; não existe reparo, retry ou segunda chamada.
- [ ] Exact match operacional é a autoridade; componentes e slices estão publicados com n.
- [ ] False-action, false-EXIT e broadened têm gates específicos e zero observado no produto exigido.
- [ ] Limites binomiais, IID assumptions e correlação estão documentados.
- [ ] Configuração foi replicada em workspace independente.
- [ ] Latência, VRAM, OOM, cap e logs foram medidos localmente.
- [ ] Shadow futuro-real passou sem qualquer ordem.
- [ ] Harness continua dono de identidade, estado, risco, quantidade, conta, símbolo, leverage, idempotência e execução.
- [ ] Rollback e kill switch foram ensaiados.
- [ ] Não há mensagens, predições, símbolos, IDs, labels privados, adapters ou segredos no material público.
- [ ] Uma autorização separada foi obtida para qualquer canary; sem ela, não há deploy.

## 20. One-page operating protocol

**Objetivo:** extrair semanticamente uma mensagem privada, uma vez, para um JSON final, sem delegar execução ao modelo.

**Antes de treinar:** congelar schema original, serializer, prompt, chat template, tokenizer e decoder; agrupar threads; separar tempo/origem; auditar labels; construir matriz crítica real; congelar DEVELOPMENT e GENERALIZATION; reservar future-real shadow.

**Treino:** SFT prompt-completion, loss somente na completion, EOS exato, zero truncation, LoRA para velocidade experimental, uma variável por família, no máximo três runs por família, receipt e hashes. Não usar loss como score.

**Dados:** reais têm prioridade; synthetic é apenas complemento taggeado; usar matched negatives, counterfactuals humanos e hard negatives; não usar DEVELOPMENT/predições; calibrar balanceamento sem assumir proporção ótima.

**Runtime:** uma chamada `generate`; `do_sample=False`; XGrammar apenas como restritor estrutural; EOS somente em estado aceitante; parse estrito; Draft 2020-12 original; rejeitar cap, duplicata, texto extra e qualquer JSON incompleto; sem parser repair, substring, default, retry ou segunda chamada.

**Métricas:** full operational exact é autoridade. Reportar schema, evento, ação PRF, false-action, false-EXIT, broadened, literal, guard, ordering, grounding, abstention, slices por role/mode/polarity/source/length/position e p50/p95/VRAM. Sempre incluir numerador, denominador e intervalo.

**Decisão:** se coverage/label/independence falhar, voltar a G1–G4. Só depois testar 0,8B; se ainda houver ceiling de capacidade, ~4B e depois ~8B sob contrato idêntico. Replicar antes de GENERALIZATION. Abrir GENERALIZATION uma vez; depois shadow future-real sem ordens. Canary somente após autorização explícita.

**Saída segura:** uma falha é rejeição/abstenção, nunca uma ordem inventada. O harness valida estado, risco e execução. Este protocolo não autoriza GENERALIZATION, deploy, broker execution ou Google API mutation.

## 21. Fontes e referências

As fontes web abaixo foram acessadas em 2026-07-22 durante a pesquisa. A data de acesso é distinta da data de publicação/conteúdo. Qualidade e escopo indicam o peso da evidência; claims de fornecedor e extrapolações entre tarefas foram enfraquecidos no texto.

| [n] | Fonte direta | Tipo e data de conteúdo/publicação | Acesso e qualidade |
|---:|---|---|---|
| [1] | [OpenAI — Fine-tuning / Model optimization](https://platform.openai.com/docs/guides/fine-tuning) | documentação oficial; conteúdo consultado em 2026-07-22 | acessada por Jina Reader em 2026-07-22; forte para SFT/eval loop, não para suficiência deste dataset |
| [2] | [Hugging Face TRL — SFT Trainer](https://huggingface.co/docs/trl/sft_trainer) | documentação oficial; versão consultada com conteúdo datado de 2025-09-10 | Jina Reader, 2026-07-22; forte para prompt-completion, masks e EOS, depende da versão/runtime |
| [3] | [Hugging Face PEFT — LoRA reference](https://huggingface.co/docs/peft/main/en/package_reference/lora) | documentação oficial; sem data de conteúdo fornecida | Jina Reader, 2026-07-22; apoio metodológico, não garantia de acurácia |
| [4] | [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) | artigo de pesquisa; submetido 2021-06-17, versão citada 2021-10-16 | metadata/abstract acessados em 2026-07-22; evidência primária, tarefas não são este extrator |
| [5] | [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) | artigo de pesquisa; 2023-05-24 | metadata/abstract acessados em 2026-07-22; forte para viabilidade estudada, não assume ganho de qualidade |
| [6] | [NIST AI Risk Management Framework 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) | framework oficial; 2023-01 | PDF acessado em 2026-07-22; forte para representatividade, risco, monitoramento e intervenção |
| [7] | [NIST Statistical Handbook — Exact confidence limits](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) | handbook estatístico oficial; sem data fornecida | página acessada em 2026-07-22; forte para método binomial exato |
| [8] | [Datasheets for Datasets](https://arxiv.org/abs/1803.09010) | artigo de pesquisa; versão/publicação consultada 2021-12-01 | página/abstract acessados em 2026-07-22; forte para documentação, não valida os labels do projeto |
| [9] | [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core) | especificação; 2022-06 | conteúdo acessado em 2026-07-22; autoridade normativa para o modelo de dados, não para verdade externa |
| [10] | [Hugging Face Transformers — generation utilities](https://huggingface.co/docs/transformers/main/en/internal/generation_utils) | documentação oficial; sem data fornecida | acessada em 2026-07-22; forte para integração documentada de logits processors |
| [11] | [XGrammar README oficial](https://raw.githubusercontent.com/mlc-ai/xgrammar/main/README.md) | README de repositório oficial; sem data fornecida | acessado em 2026-07-22; claim do próprio projeto, limitado a estrutura |
| [12] | [Self-Instruct: Aligning Language Models with Self-Generated Instructions](https://arxiv.org/abs/2212.10560) | preprint/artigo ACL; 2022-12-20 | abstract acessado em 2026-07-22; evidência útil, mas não específica de trading |
| [13] | [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155) | artigo de pesquisa; 2022-03-07 | abstract acessado em 2026-07-22; cross-task, usado com confiança moderada |
| [14] | [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) | TACL/artigo; submetido 2023-07-06, conteúdo consultado 2023-11-22 | abstract acessado em 2026-07-22; forte como alerta de posição, não como lei para este modelo |
| [15] | [Selective Classification for Deep Neural Networks](https://arxiv.org/abs/1705.08500) | preprint; 2017-05-23 | abstract acessado em 2026-07-22; método de reject option, não threshold pronto |
| [16] | [DeepXplore: Automated Whitebox Testing of Deep Learning Systems](https://arxiv.org/abs/1705.06640) | paper SOSP/preprint; 2017-05-18 | abstract acessado em 2026-07-22; inspiração para cobertura/differential testing offline |
| [17] | [Learning the Difference that Makes a Difference with Counterfactually-Augmented Data](https://arxiv.org/abs/1909.12434) | paper ICLR; 2019-09-26 | abstract acessado em 2026-07-22; suporte para edição mínima humana, tarefa diferente |
| [18] | [Qwen3-0.6B model card](https://huggingface.co/Qwen/Qwen3-0.6B) | card oficial Qwen; 2025 | acessado em 2026-07-22; refere-se a Qwen3-0.6B, não ao checkpoint exato Qwen3.5-0.8B |
| [19] | [Unsloth — Qwen3 fine-tuning](https://docs.unsloth.ai/basics/qwen3-how-to-run-and-fine-tune) | documentação de fornecedor; sem data fornecida | acessada em 2026-07-22; baixa para claims de VRAM/velocidade, exige benchmark local |
| [20] | [Direct Preference Optimization](https://arxiv.org/abs/2305.18290) | preprint; 2023-05-29 | abstract acessado em 2026-07-22; apoio para conceito de preference loss, não para este produto |
| [21] | [Google ML Crash Course — Overfitting](https://developers.google.com/machine-learning/crash-course/overfitting/overfitting) | documentação educacional; conteúdo datado de 2025-12-03 | acessada em 2026-07-22; apoio para independência/generalização, não validação do projeto |

**Falhas de recuperação relevantes:** fontes tentadas sobre imbalance, reproducibility, metamorphic testing, weak-to-strong distillation e algumas páginas de modelo/infra receberam HTTP 429 ou 404. Nenhum claim dependente delas foi apresentado como facto. A literatura publicada sustenta componentes do método; não especifica a mistura ótima, learning rate ótimo, tamanho ótimo ou capacidade suficiente para este extrator.

## Apêndice A — Evidência local do projeto

Este apêndice separa evidência do projeto de bibliografia publicada. Os caminhos são artefatos agregados do repositório; nenhuma mensagem privada, predição, símbolo, ID, adapter ou segredo é reproduzido.

### A.1 Task97 e Task96

| Evidência | Caminho exato | Leitura agregada | SHA256 do manifest |
|---|---|---|---|
| Task97 fresh model run | `.pi/build/broker_semantic_v62_task_97_checkpoint/completion_manifest.json` | Qwen3.5-0.8B fresco; BF16 LoRA; XGrammar; métricas semanticamente reprovadas | `078d6b4a7996492b166bd89e829c22930e1d8a059e1ad7e0882df02c76ad9f52` |
| Task96 runtime smoke | `.pi/build/broker_semantic_v62_task_96_checkpoint/completion_manifest.json` | sem modelo/treino/predições; runtime smoke `100/100`, bases `5/5`, inválidos `11/11` | `9fad1b16e943774389efb9ef76379cd096cb97b5d03a25c8c0ae840e95d2222a` |

O Task97 manifest registra `gate_passed=false`, `invalid_count=0`, `cap_hit_count=0`, `completed_updates=3537`, `loss_count=3537` e o vetor de métricas usado na seção 2. O Task96 manifest registra zero updates/losses/prediction rows e `no_model_training_generation=true`. Esses são agregados de execução, não exemplos de saída.

### A.2 Coverage e generalização

- `.pi/build/broker_semantic_v62_task_97_checkpoint/completion_manifest.json`
- `.pi/build/broker_semantic_v62_task_96_checkpoint/completion_manifest.json`
- `docs/broker_semantic_research/V58_DATASET_COVERAGE_MATRIX.md`
- `docs/broker_semantic_v61/GENERALIZATION_ANALYSIS_AND_ACTION_PLAN.md`
- `docs/broker_semantic_research/QWEN08B_E1_PRODUCTION_PROTOCOL.md`
- `runtime/datasets/broker_semantic_v62/freeze/manifest.json`
- `runtime/datasets/broker_semantic_v62/candidates/H0_CAL/manifest.json`

O freeze manifest marca DEVELOPMENT como `DEVELOPMENT_ONLY` e GENERALIZATION como `FREEZE_ONLY`; o candidato H0_CAL lista GENERALIZATION com zero rows no produto candidato. Isso sustenta a afirmação de que o candidato não abriu GENERALIZATION; não sustenta qualquer claim de desempenho nela.

### A.3 Runner e limites de reprodução

- `src/auto_trader/local_lora/train_unsloth_qwen35_08b_v62.py`

O caminho relevante verifica chat template e EOS, mede token readiness sem truncamento, cria labels `-100` para prompt e labels ativas para completion, treina com batch/accumulation fixos da execução auditada e chama `model.generate` uma vez para cada row. O decoder é aplicado como `LogitsProcessor`; a saída completa é validada no avaliador do projeto. A existência desse caminho não prova deterministicidade CUDA universal: a documentação local registra controles de determinismo que podem não estar todos ativados. Por isso replicação é gate.

### A.4 Evidência local anterior usada como contexto, não como alvo adaptativo

- `docs/broker_semantic_research/V58_DATASET_COVERAGE_MATRIX.md`
- `docs/broker_semantic_v61/GENERALIZATION_ANALYSIS_AND_ACTION_PLAN.md`
- `docs/broker_semantic_research/QWEN08B_E1_PRODUCTION_PROTOCOL.md`

O V58 declara expressamente que seus counts são investigação, não prova de suficiência. A análise v6.1 registra que DEVELOPMENT foi adaptativo, que variants do mesmo gerador não demonstram independência linguística e que o shadow estava `BLOCKED_NO_PROVEN_CLEAN_POOL`. O protocolo Qwen08B registra gates de no truncation, safety zero, replication, shadow e sealed explicitamente fechado. Este guia preserva essas limitações.

## Apêndice: Metodologia

Foram reconciliados cinco artefatos YAML de Fase 1 sobre foundations de fine-tuning, ciência de avaliação, structured output, estratégia de dados/modelos e métodos experimentais, além dos manifests e documentos locais listados no Apêndice A. A coleta web ocorreu em 2026-07-22. Factos publicados foram mantidos no escopo da fonte; resultados de vendor foram enfraquecidos; extrapolações cross-task foram marcadas como INFERENCE. Não houve nova pesquisa de dados privados nem inspeção de mensagens ou predições.

A confiança geral deste guia é **Média-Alta para o veredito imediato e Média para a receita ótima**. O veredito imediato tem convergência entre manifesto Task97, auditoria de cobertura, protocolo e evidência de runtime: candidato semanticamente reprovado e não implantável. A receita ótima permanece desconhecida porque faltam adjudicação completa, denominadores por slice, um pool futuro-real independente e uma comparação causal depois dos gates. Consequentemente, nenhum número de rows, proporção synthetic, learning rate, rank, epoch ou tamanho de modelo novo é apresentado como garantia.

A metodologia de decisão é conservadora:

1. separar facto de inferência e desconhecido;
2. reconciliar cada claim com fonte, data, independência, confiança e caveat;
3. tratar exact match operacional como autoridade;
4. manter schema e harness contracts imutáveis;
5. exigir source/thread/time independence;
6. usar intervalos binomiais e denominadores por slice;
7. mudar uma variável por família;
8. replicar antes de qualquer abertura final;
9. testar shadow sem ordens;
10. parar quando a evidência não autorizar o passo seguinte.

Este documento é um guia de produção de pesquisa. Ele não autoriza abrir GENERALIZATION, deploy, broker execution, canary ou Google API mutations.
