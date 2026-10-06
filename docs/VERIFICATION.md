# Verificação — percurso completo, movimento visual e PT-BR

## V2.1.1 Semantic Reliability

Correção incremental validada em 6 de outubro de 2026. RAW, coleta, budgets e proteções de segurança preservados. A identidade reutiliza radius geométrico; o foreground considera texto interno visível e fundo local; as roles de cor passam por resolução de conflitos de proveniência. O resumo menciona persistência somente com confidence ≥ 0,7, três checkpoints e duas regiões, sem afirmar causalidade.

Comparação determinística sobre o RAW anterior `f5673975-ed8d-4d65-93f0-d56cfa8ad1cb`, sem sobrescrevê-lo, e nova captura pública concluída pelo worker seguro em `c9407485-cbcd-4d9a-b2b0-4dfc7e7d50e1` (`data/`, artefatos locais sujeitos à retenção):

| Ponto | Antes | Depois, confirmado na nova captura |
| --- | --- | --- |
| Radius global | `high radius`, mediana crua 1080px, confidence 1 | `pill-heavy`, confidence 0,85; 22 pills, 17 círculos, 51/104 caixas arredondadas; raios convencionais 5–6px, razão mediana 0,017, 26 contextos |
| Família de 3 cards | Fundo e foreground `#faae33` | Fundo `#faae33`, texto `#402011`, resolvido como `colors.textSecondary`, sustentado por títulos e descrições internos |
| Secondary/accent | Ambos `#402011`, evidências genéricas semelhantes | Ambos permanecem `#402011`, mas a evidência explicita 12 ações e 4 highlights independentes em 2 regiões. Primary permanece `#faae33`. Mesmas ações sem suporte independente deixam a role desconhecida nos testes |
| Resumo de movimento | Apenas contagem de padrões | `persistentScroll`: persistência observada em várias regiões, sem causalidade estabelecida; padrão com confidence 0,7, 20 checkpoints e 8 regiões |

Hungry Tiger: página de 16.866 px, scroll e screenshots desktop com cobertura de 100%, 332 elementos, 20 checkpoints e captura segmentada. Mobile alcançou o fim, com cobertura observada de 30,7%; nenhum canvas observado. A comparação do mesmo RAW isola a alteração semântica das variações do site.

Novos testes: nove regressões unitárias para radius/RAW, foreground diferente do wrapper, contraste contextual, transparência/visibilidade, labels interativos, ausência de texto, conflitos e evidências independentes, unknowns e resumo conservador. Uma fixture HTML com `.card`, `h3` e `p` verifica os valores computados no Chromium e a preservação do RAW.

Validação executada: `npm run lint`, `npm run typecheck`, `npm test` (**70 aprovados**), `npm run build`, `npm run test:api` (**1 aprovado**), `npm run test:e2e` (**7 aprovados**) e `node --check` em `web/app.js`, `web/semantic.js` e `web/i18n.js`. As evidências novas também têm apresentação PT-BR, sem alteração de layout.

Limites: folhas textuais e fundos locais são amostras DOM, não uma auditoria de pixels; transparência parcial, gradientes, imagens e oclusão limitam o contraste. Sem texto observável, `visualStyle.color` é omitido. Confidence continua heurística. O resumo reconhece as contagens da evidência produzida pelo detector atual; evidência ausente ou incompatível não gera a frase. Registros históricos não são migrados automaticamente.

## Histórico da entrega anterior

Data: 6 de outubro de 2026. Windows, Node.js 24.21.0, Playwright 1.63.0; Chromium com `chromiumSandbox: true`. O terminal da ferramenta exigiu execução fora do sandbox por falha de inicialização (`helper_unknown_error: setup refresh had errors`); o sandbox da aplicação permaneceu ativo.

## Mudanças arquiteturais e bugs corrigidos

- Coleta inicial mais coletas por checkpoint, merge limitado com identidade WeakMap, frames desktop/mobile e altura reavaliada.
- DOM, scroll, screenshots e motion têm métricas independentes; ausência de `full.png` não indica ausência de análise.
- Manifesto no registro/API, reconciliado com arquivos reais na listagem e no detalhe. A interface só oferece downloads existentes; **Página inteira** abre integral ou galeria segmentada.
- Percurso sem teto fixo de altura, limitado por 20/6 checkpoints desktop/mobile e 24/7 segundos dentro dos deadlines de 60/75 segundos. Passos em pixels com sobreposição e orçamento restante, frames reais mais estabilização limitada.
- JPEGs de viewport para páginas longas, até 24 MiB agregados. Reuso de `main.png`, remoção de segmentos redundantes quando existe integral, PNGs regionais apenas em memória. Retenção UUID existente e limpeza de temporários após escrita/falha/reinício.
- Canvas explícito no RAW, assinaturas RGB reduzidas, controles sem scroll e novas evidências de mudança visual/associação/persistência. Sem IA, extração WebGL ou cópia de assets.
- Container de conteúdo separado de viewport/estrutura externa; sanity checks responsivos, radius pill/circle, papéis de cor com resolução de conflito, canais de componente independentes e tokens de spacing condicionados a escala recorrente.
- UI PT-BR com cobertura e avisos expansíveis; chaves JSON e compatibilidade V1/V2 preservadas. `VisionAnalyzer` ampliado com entradas opcionais; sem implementação externa.

## Testes e validação

| Comando                                                     | Resultado                                        |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `npm run lint`                                              | Aprovado                                         |
| `npm run typecheck`                                         | Aprovado                                         |
| `npm test`                                                  | 61 aprovados, incluindo os 53 anteriores         |
| `npm run build`                                             | Aprovado                                         |
| `npm run test:api`                                          | 1 integração aprovada                            |
| `npm run test:e2e`                                          | 6 aprovados, nenhum pulado, Chromium com sandbox |
| `node --check web/app.js`, `web/semantic.js`, `web/i18n.js` | Aprovados                                        |

Os E2Es anteriores foram mantidos; o teste da UI passou a procurar os rótulos em português. A fixture longa cobre mais de 15.000 px, captura segmentada sem `full.png`, fim efetivamente alcançado, cobertura vertical completa, conteúdo lazy inserido antes de nós existentes, identidade estável, mobile tardio e três canvas (scroll, estático e temporal). Só os dois canvas que mudam geram mudança visual; só o controlado por scroll gera associação. API verifica arquivos ausentes, segmentos permitidos/proibidos e remoção de arquivo após manifesto; a UI verifica ausência dos links quebrados e abertura da galeria. Unitários cobrem intervalos sobrepostos, lacunas em páginas extremas, limites de merge, controles temporais, semântica de container/radius, cores independentes e escala de spacing.

A interface foi também renderizada com o registro real do Hungry Tiger em 1440 px, inspecionada visualmente e conferida em 390 px sem overflow horizontal. A imagem temporária de revisão foi removida após inspeção. Uma regressão adicional cobre texto descendente com cor diferente do wrapper, para não confundir foreground com background.

Na primeira execução nova, a fixture revelou uma lacuna de ~34 px por scroll anchoring após inserção no topo, e a API revelou um padrão de nome de segmento com um dígito excedente. As correções foram sobreposição de viewport e allowlist de três dígitos; os testes passaram após as correções. Nenhuma asserção de cobertura foi relaxada para aceitar a lacuna.

## Hungry Tiger — validação real

Executado `node --import tsx tests/validate-public.ts https://www.eathungrytiger.com`, pelo worker de produção, com transporte `safeFetch`, SSRF/DNS/IP validation, proxy fail-closed, sandbox e encerramento em 75 s. Nenhuma regra específica para o domínio.

Registro: `f5673975-ed8d-4d65-93f0-d56cfa8ad1cb`, em `data/f5673975-ed8d-4d65-93f0-d56cfa8ad1cb/`. É um UUID normal do histórico e participa da retenção de 7 dias/30 registros. O site público é variável; o resultado abaixo descreve esta execução.

| Medida solicitada          | Resultado observado                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Altura total final         | 16.866 px; largura 1.440 px                                                                                                                     |
| Quanto foi percorrido      | Scroll de 0 a 15.966 px; viewport final termina em 16.866 px                                                                                    |
| Cobertura desktop          | 100% das faixas verticais; fim alcançado                                                                                                        |
| Checkpoints desktop        | 20                                                                                                                                              |
| Elementos iniciais         | 321                                                                                                                                             |
| Elementos adicionais       | 11; total 332, sem truncamento                                                                                                                  |
| Canvas encontrados         | 0 na amostra renderizada desta execução                                                                                                         |
| Mudança visual em canvas   | Não observada; não há evidência para afirmar ausência no site original                                                                          |
| Fixed/sticky               | 4 fixed e 1 sticky; 1 padrão `persistent-scroll-visual` em 20 checkpoints e 8 regiões                                                           |
| Outras mudanças            | 19 instâncias de transformação observada e 1 de opacidade; isso não prova causalidade de scroll                                                 |
| Landing inteira observada? | Sim quanto às faixas verticais desktop da página renderizada; não equivale a observar todos os estados interativos/temporais ou todos os assets |
| Mobile                     | 390×844; página com 16.488 px; 324 elementos; 6 checkpoints; fim alcançado, cobertura de 30,7%                                                  |
| Screenshots                | `main.png`, `mobile.png`, `segment-001.jpg` até `segment-019.jpg`; 20 regiões incluindo reuso do topo; sem `full.png`                           |
| Captura visual desktop     | 100% vertical e horizontal no manifesto                                                                                                         |

Posições desktop: `0, 810, 1620, 2430, 3240, 4050, 4860, 5670, 6480, 7343, 8206, 9069, 9932, 10794, 11656, 12518, 13380, 14242, 15104, 15966`.

Foi registrado **1 recurso secundário indisponível por rede/TLS/política/limite**, além do aviso de amostragem mobile parcial. O transporte não identifica publicamente a URL desse recurso; não é possível atribuir com segurança a ausência de canvas a essa falha. A validação de canvas é sustentada pelas fixtures controladas. A altura difere do exemplo anterior de 15.293 px porque o layout renderizado/estado de carregamento pode mudar.

## Limitações restantes

Limites de checkpoint/tempo podem produzir lacunas ou impedir o fim em páginas infinitas. A cobertura mede faixas geométricas observadas, sem garantir cada pixel desocluído, fonte/asset carregado ou estado interativo. O mobile é deliberadamente amostral. Canvas é limitado a três regiões visíveis por checkpoint e 120 estados, sem iframe/shadow DOM, decomposição 3D ou entendimento semântico. Comparações são sensíveis a oclusão, recorte e tempo; A/A2/B oferece associação, nunca prova absoluta. Confiança continua heurística. Não há nova cota rígida de memória nativa do Chromium; isso continua dependendo de isolamento do SO para uso hospedado.

## Arquivos criados

- `src/browser/traversal.ts`, `src/browser/visual.ts`
- `web/i18n.js`
- `tests/traversal.test.ts`, `tests/long-fixture.html`, `tests/validate-public.ts`

## Arquivos modificados

- `src/browser/engine.ts`, `src/browser/collect.ts`
- `src/types.ts`, `src/worker.ts`, `src/server.ts`, `src/storage/store.ts`
- `src/analysis/semantic/{colors,components,layout,motion,responsive,spacing,tokens,types}.ts`
- `web/{index.html,app.js,semantic.js,style.css}`
- `tests/{browser.e2e,ui.e2e,api.e2e,store.test}.ts`
- `README.md`, `docs/VISUAL_DNA.md`, `docs/VERIFICATION.md`

SSRF/DNS/transporte, `src/process.ts`, Host/Origin, CSP, limites de requests/bytes e dependências não foram modificados. Conventional Commit sugerido: `feat(capture): add full-page traversal and visual motion tracking`.

---

# Histórico de verificação — Semantic Analyzer V2

Data: 6 de outubro de 2026. Ambiente: Windows, Chromium do Playwright 1.63.0 com sandbox ativo. O impedimento histórico do MVP em Linux/root não se aplica a esta execução.

| Comando                                       | Resultado V2                             |
| --------------------------------------------- | ---------------------------------------- |
| `npm run lint`                                | Aprovado                                 |
| `npm run typecheck`                           | Aprovado                                 |
| `npm test`                                    | 53 aprovados, incluindo os 32 existentes |
| `npm run build`                               | Aprovado                                 |
| `npm run test:api`                            | 1 integração aprovada                    |
| `npm run test:e2e`                            | 5 aprovados, Chromium com sandbox        |
| `node --check web/app.js` e `web/semantic.js` | Aprovados                                |

O terminal no sandbox da ferramenta falhou antes de iniciar comandos (`helper_unknown_error: setup refresh had errors`). A execução fora dele permitiu verificar o projeto. O sandbox do Chromium da aplicação não foi alterado.

## Cobertura nova

Cores modernas/equivalências OKLab/alpha, clustering, roles por contexto, primeiro botão vermelho versus ações azuis, destaque dourado, cobertura sem somar sobreposições, spacing, títulos em div, hero/falso hero, anatomia/famílias/tokens, tipografia, responsive, motion, confiança/unknowns, resumo determinístico, RAW separado e amostra de 1.800 elementos. O limite de regressão é 3 segundos; execução observada na ordem de dezenas de milissegundos, sem promessa de SLA.

Storage/API verificam V1/V2, downloads DNA/RAW, 404 para RAW antigo, retenção e proteção de caminhos. Os E2Es verificam estilos, screenshots, cinco frames, mobile, V2, redirect privado, erro HTTP principal, HTTP 400 secundário em imagem/iframe e todas as abas V1/V2 com evidências renderizadas como texto.

Os testes antigos de contrato continuam cobrindo `buildRawDNA`. O E2E original mantém suas asserções e acrescenta V2 sobre a mesma captura. Nenhuma cobertura de segurança foi removida.

## MetaTFT: validação pública adicional

Captura de `https://www.metatft.com/` com `capture()` e `safeFetch` de produção, DNS/IP validation, proxy de negação e sandbox ativos. Sem regras específicas de domínio.

Artefatos: `data/validation-metatft/{analysis.raw.json,visual-dna.json,main.png,full.png,mobile.png}`. Esse diretório de diagnóstico não é um registro UUID do histórico e não participa da retenção automática. O RAW permite reanálise sem novo tráfego.

| Sinal                       | Resultado na captura                                          |
| --------------------------- | ------------------------------------------------------------- |
| Elementos desktop           | 191                                                           |
| Layout técnico / regiões V2 | 69 / 5                                                        |
| Hero                        | 1 hero; mídia sobreposta não vira split                       |
| Cards                       | 1 família de 3 feature cards, ~355 × 282 px                   |
| Motion técnico / padrões V2 | 18 / 6                                                        |
| Tema / fundo                | Escuro; família dominante próxima de `#222326`                |
| Primary / accent            | Dourado recorrente `#cbb46c`, não o primeiro botão vermelho   |
| Tipografia                  | Poppins declarada, corpo 14 px, contraste moderado de heading |
| Spacing                     | Unidade inferida 2 px                                         |
| Container                   | Externo ~1140 px; conteúdo interno ~1110 px                   |

Recursos secundários retornaram HTTP 400/401/403/405 e falhas de rede/política. Avisos seguros foram registrados; a análise principal terminou. Esses recursos podem afetar a aparência capturada. O site público é validação adicional, não fixture estável ou prova geral de acurácia.

## Limitações e arquivos

Cobertura estima fundos; confiança não é probabilidade; não há pixel analysis, breakpoints exatos, causalidade de scroll, hover ou fonte carregada confirmada. Pricing/testimonial sem evidência são omitidos. Famílias muito diferentes em dimensão podem se separar. Consulte `VISUAL_DNA.md` para limites completos.

Todos os comandos solicitados puderam ser executados; nenhum E2E foi pulado. Não houve nova auditoria de dependências nem certificação para produção. SSRF/transporte/encerramento de processos não foram alterados.

Criados: `src/analysis/raw.ts`; `src/analysis/semantic/{types,confidence,context,color-space,colors,typography,spacing,layout,tokens,components,responsive,motion,identity,index}.ts`; `src/browser/warnings.ts`; `web/semantic.js`; `tests/semantic-fixture.ts`, `tests/semantic.test.ts`, `tests/ui.e2e.ts`.

Modificados: `src/analysis/dna.ts`, `src/types.ts`, `src/browser/collect.ts`, `src/browser/engine.ts`, `src/worker.ts`, `src/storage/store.ts`, `src/server.ts`, `web/app.js`, `tests/analyzer.test.ts`, `tests/browser.e2e.ts`, `tests/api.e2e.ts`, `tests/store.test.ts`, `package.json`, `README.md`, `docs/VISUAL_DNA.md`, `docs/VERIFICATION.md`.

CSS/HTML da interface, dependências e lockfile preservados. Sugestão de commit: `feat(analyzer): introduce semantic visual DNA v2`.

## Histórico da entrega MVP — resultados anteriores, não o estado atual

Ambiente: Node.js 24, Linux, execução como root.

| Verificação                                  | Resultado                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Instalação npm / lockfile                    | Executada                                                                         |
| ESLint                                       | Passou                                                                            |
| TypeScript estrito                           | Passou                                                                            |
| Testes unitários                             | 32 passaram                                                                       |
| Auditoria npm de dependências de produção    | Nenhuma vulnerabilidade reportada pelo npm; não é auditoria de segurança completa |
| Build TypeScript                             | Passou                                                                            |
| Sintaxe do JavaScript da interface           | Passou                                                                            |
| Inicialização do servidor compilado          | Passou                                                                            |
| `GET /api/health`                            | HTTP 200, `ok: true`                                                              |
| `GET /`                                      | HTTP 200                                                                          |
| `POST /api/analyses` com loopback            | HTTP 400                                                                          |
| POST com Origin externo                      | HTTP 403                                                                          |
| Coleta de página controlada em Chromium      | Bloqueada pelo ambiente; não validada                                             |
| E2E de redirecionamento privado no navegador | Não validado sem lançamento do Chromium                                           |
| Inspeção visual da UI em navegador real      | Não realizada                                                                     |

## Impedimento do navegador

O Chromium instalado não inicia com sandbox numa sessão root. A tentativa de execução sem privilégios foi bloqueada pelo ambiente (`cannot set groups: Operation not permitted`). Nenhuma opção para desligar o sandbox foi aplicada. Assim, screenshots reais e JSON derivado da fixture **não foram gerados durante esta entrega**. A geração do DNA foi validada com dados sintéticos nos testes unitários, o que não substitui a captura completa.

Os E2Es não são marcados como aprovados quando o navegador não inicia. Eles devem falhar explicitamente, permitindo distinguir um impedimento de ambiente de um teste realmente executado.

## Verificação pendente no computador do usuário

1. `npm ci`
2. `npm run browser:install`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run build`
7. `npm run test:api` e `npm run test:e2e` em conta não root e ambiente compatível com sandbox.
8. `npm start`, abrir `http://localhost:4173` e analisar uma página pública de sua escolha.
9. Conferir screenshot, paleta, escalas, avisos, versão e download JSON.
10. Testar mobile, recarregar a interface e abrir novamente a análise pelo histórico.

O teste controlado não faz conexão à internet para obter a fixture e não modifica a política pública de SSRF. O transporte é injetado diretamente no motor pelo teste, sem endpoint ou variável que habilite bypass na aplicação.
