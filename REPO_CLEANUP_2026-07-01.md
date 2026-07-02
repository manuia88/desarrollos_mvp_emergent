# Limpieza de repo — 2026-07-01

Consolidado: `main` = `feat/p1-feeders` @ `86a69c56` (todo el trabajo).
Criterio de borrado: `git cherry main <rama>` = 0 commits con contenido único → su código YA está en main (cero pérdida).
Registro de SHAs por si algún día se quiere recuperar un puntero.

## BORRADAS (contenido 100% en main · sin pérdida)
| rama | tip SHA | ámbito |
|---|---|---|
| asesor-audit | `9febd3dc` | local+remoto |
| asesor-f1-sidebar | `57eb1e28` | local+remoto |
| asesor-f15-layout | `0497b716` | local+remoto |
| asesor-p1-command-center | `5c8380fb` | local+remoto |
| asesor-p4-voice-digest | `eb6d84ef` | local+remoto |
| b2-marketplace | `2b065aa4` | local |
| backup-post-wave1-tests-20260511-000257 | `49fe773e` | local+remoto |
| backup-pre-F1-20260521-1002 | `b4453197` | local+remoto |
| backup-pre-F2-20260521-1013 | `308d4a5d` | local+remoto |
| backup-pre-F3-20260521-1110 | `1f215e28` | local |
| backup-pre-F6-20260521-1700 | `935c6914` | local+remoto |
| backup-pre-wave1-tests-20260510-234709 | `209f8929` | local+remoto |
| backup-pre-wave2-20260511-000412 | `49fe773e` | local+remoto |
| dev-redesign-tandas | `1f4629cd` | local+remoto |
| safety/pre-b18-account-switch | `dd3006f9` | local+remoto |
| w6-batch3-merge | `b5d5a8c2` | local |
| w6-batch4-merge | `998df447` | local |
| w6-merge | `94867c40` | local |
| w6-r1-merge | `70742b73` | local |
| w6-r2-merge | `c5f4b90b` | local |
| conflict_080526_1644 | `821d891a` | remoto |
| conflict_080526_2018 | `0ce15a18` | remoto |
| conflict_090526_0312 | `89d4a524` | remoto |
| conflict_090526_0656 | `9e11667a` | remoto |
| conflict_100526_0631 | `c419d21d` | remoto |
| conflict_100526_0653 | `589f5cd1` | remoto |
| conflict_100526_0720 | `7b8c5093` | remoto |
| conflict_100526_0836 | `de176a7f` | remoto |
| conflict_100526_1534 | `c33d31cb` | remoto |
| conflict_100526_1559 | `7e0a10c5` | remoto |
| conflict_100526_1730 | `fbdc7570` | remoto |
| conflict_100526_1750 | `e6202bb8` | remoto |
| conflict_100526_1825 | `5ee3807a` | remoto |
| conflict_100526_1918 | `e13d6ccd` | remoto |
| conflict_100526_1946 | `c2a96a5c` | remoto |
| conflict_100526_2007 | `834eb275` | remoto |
| conflict_100526_2303 | `093ae829` | remoto |
| p1-recheck | `d360447d` | remoto |

## CONSERVADAS (trabajo único NO en main · NO tocar)
| rama | únicos+ | tip SHA |
|---|---|---|
| asesor-p2-t1-orchestrator | 1 | `866c1973` |
| asesor-p2-t2-closer-analyst | 1 | `1abe3628` |
| asesor-p2-t3-coach | 1 | `6308e52b` |
| asesor-p3-a-agents-cc | 1 | `a34cbfc3` |
| asesor-p3-b-command-bar | 1 | `a27b4d4c` |
| asesor-p5-a-autopilot | 1 | `3d7b52ee` |
| asesor-p5-b-ux | 1 | `2ebad5bb` |
| backup-pre-f03-20260510-2223 | 1 | `a808d021` |
| w5-10-social-ads-infra | 1 | `e34022fe` |
| w5-22-z4-video-standalone | 1 | `e4b4c566` |
| w5-22-z5-hook-predictor | 1 | `09eb6117` |
| w6-4-marketplace-templates | 1 | `7d17e59e` |
| w6-as1-workflow | 3 | `3754135e` |
| w6-mov1-soc-franchise | 1 | `390f6336` |
| w6-mov2-external-sources | 1 | `2305e860` |
| w6-mov3-reviews | 1 | `9afd491c` |
| w6-mov4-mcp | 1 | `67d22db1` |
| w6-quick-wins | 2 | `4e5a60a5` |
| w6-seed-synthetic | 1 | `4abca4e5` |
| w7-as1-lead-enrichment | 1 | `5293e8ea` |
| w7-as3-a-engine | 1 | `865bdaa5` |
| w7-as3-b-intel | 1 | `5c166921` |
| w7-as3-c-cycles | 1 | `72d1e88c` |
| w7-as3-d-ui | 1 | `10690e50` |
| w7-as3-e-ml | 1 | `a99561f6` |
| w7-as3-f-cost | 1 | `70aca6ac` |
| w7-as3-g-abtest | 1 | `a7edf562` |
| w7-as3-h-confidence | 1 | `6649bd54` |
| w7-as3-i-drift | 1 | `f245b8da` |
| w7-as6-reputation | 1 | `4bd190ef` |
| checkpoint/f0-b2-tests-criticos-20260612 (remoto) | 9 | `7c6b4d2a` |
| checkpoint/f0-b3-performance-20260612 (remoto) | 12 | `ee47ec84` |
| checkpoint/f0-b4-mkt1-20260612 (remoto) | 14 | `49638a2b` |
| checkpoint/f0-b4-mkt3-20260612 (remoto) | 16 | `d2a329e0` |
| checkpoint/f0-b4-mkt3b-catalog-20260612 (remoto) | 18 | `87b21510` |
| checkpoint/f0-b4-mkt4-robustez-20260612 (remoto) | 20 | `64b5f70d` |
| claude/dazzling-newton-9ya74t (remoto) | 1 | `68c5bcbd` |
| claude/wizardly-galileo-p6tg41 (remoto) | 20 | `64b5f70d` |
| conflict_110526_0125 (remoto) | 54 | `bd4798bc` |
