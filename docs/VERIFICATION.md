# Verificação — Semantic Analyzer V2

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
