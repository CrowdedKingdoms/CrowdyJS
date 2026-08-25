export const CROWDY_STUDIO_STYLES = `
.ck-crowdy-studio{--ck-bg:#111827;--ck-panel:#182235;--ck-line:#334155;--ck-text:#e5e7eb;--ck-muted:#94a3b8;--ck-accent:#38bdf8;container-type:inline-size;display:flex;flex-direction:column;position:relative;isolation:isolate;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--ck-bg);color:var(--ck-text);font:13px/1.4 ui-sans-serif,system-ui,sans-serif;border:1px solid var(--ck-line)}
.ck-crowdy-studio *{box-sizing:border-box}.ck-crowdy-studio button,.ck-crowdy-studio input,.ck-crowdy-studio select,.ck-crowdy-studio textarea{font:inherit}.ck-crowdy-studio button,.ck-crowdy-studio select,.ck-crowdy-studio input{background:#0f172a;color:var(--ck-text);border:1px solid var(--ck-line);border-radius:4px;padding:5px 8px}.ck-crowdy-studio button{cursor:pointer}.ck-crowdy-studio button:hover{border-color:var(--ck-accent)}.ck-crowdy-studio button:disabled{opacity:.5;cursor:not-allowed}
.ck-crowdy-studio [hidden]{display:none!important}

/* Top bar */
.ck-crowdy-studio-toolbar{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;border-bottom:1px solid var(--ck-line);position:relative;z-index:30}
.ck-crowdy-studio-project-tools,.ck-crowdy-studio-runtime-tools{display:flex;align-items:center;gap:6px;min-width:0}
.ck-crowdy-studio-primary{border-color:var(--ck-accent);color:#bae6fd}
.ck-crowdy-studio-save{color:var(--ck-muted)}
.ck-crowdy-studio-save[data-state=SAVED]{color:#86efac}.ck-crowdy-studio-save[data-state=SAVING]{color:#fde68a}.ck-crowdy-studio-save[data-state=CONFLICT]{color:#fca5a5;border-color:#f87171}.ck-crowdy-studio-save[data-state=OFFLINE]{color:#fdba74;border-color:#fb923c}
.ck-crowdy-studio-save-message{margin:0;padding:4px 6px;color:var(--ck-muted);max-width:280px}
.ck-crowdy-studio-save-actions{display:flex;gap:6px;padding:4px 6px}

/* Menus */
.ck-crowdy-studio-menu-wrap{position:relative;display:inline-flex;min-width:0}
.ck-crowdy-studio-menu-button{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-crowdy-studio-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:40;min-width:180px;max-width:320px;max-height:60vh;overflow:auto;display:flex;flex-direction:column;background:var(--ck-panel);border:1px solid var(--ck-line);border-radius:6px;padding:4px;box-shadow:0 8px 24px rgba(2,6,23,.55)}
.ck-crowdy-studio-runtime-tools .ck-crowdy-studio-menu{left:auto;right:0}
.ck-crowdy-studio-menu-item{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:4px;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ck-crowdy-studio-menu-item:hover{background:#0f172a;border:0}
.ck-crowdy-studio-menu-item[data-active=true]{color:#bae6fd}
.ck-crowdy-studio-menu-divider{border-top:1px solid var(--ck-line);margin:4px 2px}

/* New-project popover */
.ck-crowdy-studio-new{display:none;position:absolute;top:100%;left:8px;z-index:35;gap:6px;align-items:center;padding:8px;background:var(--ck-panel);border:1px solid var(--ck-line);border-radius:6px;box-shadow:0 8px 24px rgba(2,6,23,.55)}
.ck-crowdy-studio-new[data-open=true]{display:flex}
.ck-crowdy-studio-new input{flex:1;min-width:160px}

/* Workspace: rail + panes + editor */
.ck-crowdy-studio-workspace{display:flex;flex:1;min-height:0;min-width:0;position:relative}
.ck-crowdy-studio-rail{display:flex;flex-direction:column;gap:4px;padding:6px 3px;border-right:1px solid var(--ck-line);background:#0b1220}
.ck-crowdy-studio-rail-button{writing-mode:vertical-rl;padding:8px 4px;background:transparent;border:1px solid transparent;color:var(--ck-muted);border-radius:4px}
.ck-crowdy-studio-rail-button:hover{color:var(--ck-text)}
.ck-crowdy-studio-rail-button[aria-pressed=true]{color:#bae6fd;border-color:var(--ck-line);background:#0f172a}
.ck-crowdy-studio-explorer,.ck-crowdy-studio-settings{flex:none;background:var(--ck-panel);overflow:auto;padding:8px;min-width:0}
.ck-crowdy-studio-settings{border-left:1px solid var(--ck-line)}
.ck-crowdy-studio-settings h3{margin:0 0 8px}
.ck-crowdy-studio-editor-column{display:flex;flex-direction:column;flex:1;min-width:240px;min-height:0}
.ck-crowdy-studio-editor{flex:1;min-height:80px;position:relative}
.ck-crowdy-studio-textarea{width:100%;height:100%;min-height:0;resize:none;background:#0b1020;color:var(--ck-text);border:0;padding:12px;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
.ck-crowdy-studio-editor-notice{padding:4px 8px;background:#78350f;color:#ffedd5}

/* Splitters */
.ck-crowdy-studio-splitter{flex:none;background:transparent;position:relative;z-index:5}
.ck-crowdy-studio-splitter[data-orientation=vertical]{width:6px;cursor:col-resize}
.ck-crowdy-studio-splitter[data-orientation=horizontal]{height:6px;cursor:row-resize}
.ck-crowdy-studio-splitter:hover,.ck-crowdy-studio-splitter[data-dragging=true]{background:var(--ck-accent);opacity:.5}

/* Explorer */
.ck-crowdy-studio-section{margin-bottom:12px}
.ck-crowdy-studio-section-header{display:flex;align-items:center;justify-content:space-between;color:var(--ck-muted);font-weight:700;text-transform:uppercase;font-size:11px;margin-bottom:4px}
.ck-crowdy-studio-file{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px;align-items:center}
.ck-crowdy-studio-file>button:first-child{text-align:left;overflow:hidden;text-overflow:ellipsis;border:0;background:transparent}
.ck-crowdy-studio-file-action{padding:1px 6px}
.ck-crowdy-studio-file .ck-crowdy-studio-menu{left:auto;right:0;min-width:130px}
.ck-crowdy-studio-inline-form{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;padding:6px;border:1px solid var(--ck-line);border-radius:4px;background:#0f172a}
.ck-crowdy-studio-inline-form input{flex:1 1 100%;min-width:0}
.ck-crowdy-studio-file-form-row{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:4px 0;padding:6px;border:1px solid #f59e0b66;border-radius:4px}

/* Editor tabs */
.ck-crowdy-studio-tabs{display:flex;align-items:center;gap:6px;padding:4px;border-bottom:1px solid var(--ck-line);overflow:auto}
.ck-crowdy-studio-tab{white-space:nowrap}
.ck-crowdy-studio-tab[data-active=true],.ck-crowdy-studio-panel-tab[data-active=true]{border-color:var(--ck-accent);color:#bae6fd}
.ck-crowdy-studio-tab span{margin-left:7px;color:var(--ck-muted)}

/* Settings */
.ck-crowdy-studio-settings label{display:grid;gap:3px;margin-bottom:9px;color:var(--ck-muted)}
.ck-crowdy-studio-settings input,.ck-crowdy-studio-settings select{width:100%}

/* Bottom panel */
.ck-crowdy-studio-bottom{flex:none;display:flex;flex-direction:column;min-height:0;border-top:1px solid var(--ck-line)}
.ck-crowdy-studio-panel-tabs{display:flex;align-items:center;gap:6px;padding:5px 7px;border-bottom:1px solid var(--ck-line)}
.ck-crowdy-studio-panel-hide{margin-left:auto;padding:1px 7px;color:var(--ck-muted)}
.ck-crowdy-studio-panel-body{flex:1;min-height:0;display:flex;flex-direction:column}
.ck-crowdy-studio-panel{display:none;flex:1;overflow:auto;padding:8px}
.ck-crowdy-studio-panel[data-active=true]{display:block}
.ck-crowdy-studio-panel pre{white-space:pre-wrap;margin:0;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
.ck-crowdy-studio-problems-toolbar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.ck-crowdy-studio-problem-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;border-bottom:1px solid #243247}
.ck-crowdy-studio-problem-row .ck-crowdy-studio-problem{border-bottom:0;width:auto}
.ck-crowdy-studio-problem-add,.ck-crowdy-studio-problem-fix{white-space:nowrap}
.ck-crowdy-studio-problem{display:grid;grid-template-columns:auto auto 1fr;gap:8px;padding:3px;border-bottom:1px solid #243247;width:100%;text-align:left;background:transparent;border-left:0;border-right:0;border-top:0;border-radius:0}
.ck-crowdy-studio-problem[data-source=rustc]{color:#fecaca}
.ck-crowdy-studio-problem[data-source=local-advisory]{color:#fde68a}
.ck-crowdy-studio-invoke{display:grid;grid-template-columns:180px 1fr auto;gap:6px}
.ck-crowdy-studio-invoke textarea{min-height:70px;background:#0f172a;color:var(--ck-text);border:1px solid var(--ck-line)}
.ck-crowdy-studio-empty{color:var(--ck-muted);padding:8px}

/* Status bar */
.ck-crowdy-studio-statusbar{display:flex;align-items:center;gap:14px;padding:3px 10px;border-top:1px solid var(--ck-line);background:#0b1220;font-size:12px;min-height:24px}
.ck-crowdy-studio-status{color:var(--ck-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-crowdy-studio-statusbar-runtime{background:transparent;border:0;padding:1px 4px;border-radius:3px}
.ck-crowdy-studio-statusbar-runtime:hover{color:var(--ck-text)}
.ck-crowdy-studio-statusbar-runtime[data-phase=RUNNING]{color:#86efac}
.ck-crowdy-studio-statusbar-runtime[data-phase=COMPILING],.ck-crowdy-studio-statusbar-runtime[data-phase=TESTING_DRAFT],.ck-crowdy-studio-statusbar-runtime[data-phase=DEPLOYING_LIVE],.ck-crowdy-studio-statusbar-runtime[data-phase=ENABLING]{color:#fde68a}
.ck-crowdy-studio-statusbar-runtime[data-phase=COMPILE_FAILED],.ck-crowdy-studio-statusbar-runtime[data-phase=ERROR],.ck-crowdy-studio-statusbar-runtime[data-phase=PARTIAL_FAILURE]{color:#fca5a5}

/* Agent dock */
.ck-crowdy-studio-agent-dock{flex:none;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;padding:10px;border-left:1px solid var(--ck-line);background:#0b1220;overflow:auto}
.ck-crowdy-studio-agent-dock header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ck-crowdy-studio-agent-dock h2,.ck-crowdy-studio-agent-dock h3{margin:0;font-size:13px}
.ck-crowdy-studio-agent-status,.ck-crowdy-studio-agent-budget,.ck-crowdy-studio-agent-lease{color:var(--ck-muted);font-size:12px}
.ck-crowdy-studio-agent-lease[data-active=true]{color:#fde68a;border:1px solid #f59e0b;border-radius:5px;padding:6px}
.ck-crowdy-studio-agent-controls-row{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}
.ck-crowdy-studio-agent-modes,.ck-crowdy-studio-agent-controls{display:flex;gap:5px;flex-wrap:wrap}
.ck-crowdy-studio-agent-modes button[data-active=true]{border-color:var(--ck-accent);color:#bae6fd}
.ck-crowdy-studio-agent-stop{border-color:#ef4444!important;color:#fecaca!important}
.ck-crowdy-studio-agent-disclosure{border:1px solid var(--ck-line);border-radius:5px;padding:0}
.ck-crowdy-studio-agent-disclosure>summary{cursor:pointer;padding:6px 8px;color:var(--ck-muted)}
.ck-crowdy-studio-agent-disclosure[open]>summary{border-bottom:1px solid var(--ck-line);color:var(--ck-text)}
.ck-crowdy-studio-agent-disclosure>:not(summary){padding:6px 8px}
.ck-crowdy-studio-agent-lease-controls{display:flex;gap:6px;flex-wrap:wrap;margin:0;padding:7px;border:1px solid var(--ck-line)}
.ck-crowdy-studio-agent-lease-controls legend{color:var(--ck-muted)}
.ck-crowdy-studio-agent-lease-controls label{display:flex;gap:3px;align-items:center}
.ck-crowdy-studio-agent-messages{display:flex;flex-direction:column;gap:6px;flex:1;min-height:120px;overflow:auto}
.ck-crowdy-studio-agent-message,.ck-crowdy-studio-agent-stream,.ck-crowdy-studio-agent-approval,.ck-crowdy-studio-agent-diff,.ck-crowdy-studio-agent-checkpoint{padding:7px;border:1px solid var(--ck-line);border-radius:5px;background:var(--ck-panel)}
.ck-crowdy-studio-agent-message[data-role=USER]{border-color:#155e75}
.ck-crowdy-studio-agent-message p,.ck-crowdy-studio-agent-approval p,.ck-crowdy-studio-agent-diff p,.ck-crowdy-studio-agent-checkpoint p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.ck-crowdy-studio-agent-timeline{display:grid;gap:5px;margin:0;padding-left:22px;max-height:190px;overflow:auto}
.ck-crowdy-studio-agent-timeline li{padding:4px;border-bottom:1px solid #243247}
.ck-crowdy-studio-agent-timeline li>span{margin-left:6px;color:var(--ck-muted)}
.ck-crowdy-studio-agent-approvals,.ck-crowdy-studio-agent-checkpoints{display:grid;gap:7px}
.ck-crowdy-studio-agent-approval{border-color:#f59e0b}
.ck-crowdy-studio-agent-approval code{display:block;overflow-wrap:anywhere;color:#fde68a}
.ck-crowdy-studio-agent-approval>div{display:flex;gap:6px}
.ck-crowdy-studio-agent-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}
.ck-crowdy-studio-agent-composer textarea{min-height:62px;resize:vertical;background:#0f172a;color:var(--ck-text);border:1px solid var(--ck-line);padding:7px}

/* Parallel DeepSeek Harness dock — tokens from dsh-web-frontend dark theme */
.ck-crowdy-studio-dsh-dock{--dsh-bg:#151517;--dsh-layer:#1c1c1f;--dsh-line:rgb(255 255 255 / 12%);--dsh-text:#f9fafb;--dsh-muted:#adb2b8;--dsh-secondary:#cfd3d6;--dsh-brand:#4d6bfe;--dsh-user:#2a2a2e;flex:none;display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;padding:0;border-left:1px solid var(--dsh-line);background:var(--dsh-bg);color:var(--dsh-text);overflow:hidden}
.ck-crowdy-studio-dsh-header{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;border-bottom:1px solid var(--dsh-line)}
.ck-crowdy-studio-dsh-brand{display:flex;align-items:center;gap:8px;flex:none}
.ck-crowdy-studio-dsh-dock h2{margin:0;font-size:13px;letter-spacing:.08em;font-weight:600}
.ck-crowdy-studio-dsh-session-select{flex:1;min-width:0;background:var(--dsh-layer);color:var(--dsh-text);border:1px solid var(--dsh-line);border-radius:8px;padding:4px 8px}
.ck-crowdy-studio-dsh-connection{width:8px;height:8px;border-radius:50%;background:#61666b;flex:none;position:relative}
.ck-crowdy-studio-dsh-connection[data-connection=ready]{background:#22c55e}
.ck-crowdy-studio-dsh-connection[data-connection=connecting]{background:#fbbf24}
.ck-crowdy-studio-dsh-connection[data-connection=error]{background:#f87171}
.ck-crowdy-studio-dsh-connection[data-busy=true]:after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1px solid var(--dsh-brand);animation:ck-dsh-pulse 1.2s ease-out infinite}
.ck-crowdy-studio-dsh-new{margin-left:auto;background:transparent;border:1px solid var(--dsh-line);color:var(--dsh-secondary);border-radius:999px;padding:4px 10px}
.ck-crowdy-studio-dsh-transcript{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow:auto;padding:8px 12px 12px}
.ck-crowdy-studio-dsh-empty{margin:auto;text-align:center;color:var(--dsh-muted);max-width:240px}
.ck-crowdy-studio-dsh-empty-title{margin:0 0 6px;color:var(--dsh-text);font-size:16px;font-weight:600}
.ck-crowdy-studio-dsh-empty p{margin:0}
.ck-crowdy-studio-dsh-message{display:flex;max-width:100%}
.ck-crowdy-studio-dsh-message[data-kind=user]{justify-content:flex-end}
.ck-crowdy-studio-dsh-message[data-kind=assistant],.ck-crowdy-studio-dsh-message[data-kind=error]{justify-content:flex-start}
.ck-crowdy-studio-dsh-bubble{max-width:92%;padding:8px 12px;border-radius:16px;background:var(--dsh-layer);overflow-wrap:anywhere}
.ck-crowdy-studio-dsh-message[data-kind=user] .ck-crowdy-studio-dsh-bubble{background:var(--dsh-user);border-bottom-right-radius:6px}
.ck-crowdy-studio-dsh-message[data-kind=assistant] .ck-crowdy-studio-dsh-bubble{background:transparent;padding:2px 0;border-radius:0}
.ck-crowdy-studio-dsh-message[data-kind=error]{padding:8px 10px;border:1px solid #7f1d1d;border-radius:10px;background:#2a1214;color:#fecaca;display:block}
.ck-crowdy-studio-dsh-message[data-setup=true]{border-color:#854d0e;background:#1c1917;color:#fde68a}
.ck-crowdy-studio-dsh-message p,.ck-crowdy-studio-dsh-bubble p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.55}
.ck-crowdy-studio-dsh-bubble[data-md]{display:grid;gap:10px;max-width:100%}
.ck-crowdy-studio-dsh-bubble[data-md] p{margin:0;white-space:normal}
.ck-crowdy-studio-dsh-bubble[data-md] h1,.ck-crowdy-studio-dsh-bubble[data-md] h2,.ck-crowdy-studio-dsh-bubble[data-md] h3,.ck-crowdy-studio-dsh-bubble[data-md] h4{margin:0;font-weight:600;line-height:1.3;color:var(--dsh-text)}
.ck-crowdy-studio-dsh-bubble[data-md] h1{font-size:18px}
.ck-crowdy-studio-dsh-bubble[data-md] h2{font-size:15px}
.ck-crowdy-studio-dsh-bubble[data-md] h3,.ck-crowdy-studio-dsh-bubble[data-md] h4{font-size:13px}
.ck-crowdy-studio-dsh-bubble[data-md] strong{font-weight:650}
.ck-crowdy-studio-dsh-bubble[data-md] em{font-style:italic;color:var(--dsh-secondary)}
.ck-crowdy-studio-dsh-bubble[data-md] code{font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;background:#0f1115;border-radius:4px;padding:1px 4px}
.ck-crowdy-studio-dsh-bubble[data-md] pre code{padding:0;background:transparent}
.ck-crowdy-studio-dsh-bubble[data-md] ul,.ck-crowdy-studio-dsh-bubble[data-md] ol{margin:0;padding-left:18px}
.ck-crowdy-studio-dsh-bubble[data-md] li{margin:2px 0}
.ck-crowdy-studio-dsh-bubble[data-md] blockquote{margin:0;padding:0 0 0 10px;border-left:2px solid var(--dsh-brand);color:var(--dsh-secondary)}
.ck-crowdy-studio-dsh-bubble[data-md] hr{border:0;border-top:1px solid var(--dsh-line);margin:2px 0}
.ck-crowdy-studio-dsh-bubble[data-md] a{color:#93c5fd}
.ck-crowdy-studio-dsh-bubble[data-md] table{width:100%;border-collapse:collapse;font-size:12px;line-height:1.4}
.ck-crowdy-studio-dsh-bubble[data-md] th,.ck-crowdy-studio-dsh-bubble[data-md] td{border:1px solid var(--dsh-line);padding:5px 7px;text-align:left;vertical-align:top}
.ck-crowdy-studio-dsh-bubble[data-md] th{background:#1c1c1f;color:var(--dsh-secondary);font-weight:600}
.ck-crowdy-studio-dsh-bubble pre,.ck-crowdy-studio-dsh-card pre{margin:8px 0 0;padding:8px;border-radius:8px;background:#0f1115;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}
.ck-crowdy-studio-dsh-bubble[data-md] pre{margin:0}
.ck-crowdy-studio-dsh-card{border:1px solid var(--dsh-line);border-radius:10px;background:var(--dsh-layer);padding:0;color:var(--dsh-secondary)}
.ck-crowdy-studio-dsh-card>summary{cursor:pointer;padding:7px 10px;list-style:none;font-size:12px}
.ck-crowdy-studio-dsh-card>summary::-webkit-details-marker{display:none}
.ck-crowdy-studio-dsh-card>pre{margin:0;border-top:1px solid var(--dsh-line);border-radius:0 0 10px 10px}
.ck-crowdy-studio-dsh-question{display:grid;gap:10px;border:1px solid #eab308;border-radius:12px;background:#422006;padding:10px 12px;color:#fde68a}
.ck-crowdy-studio-dsh-question-kicker{margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#facc15}
.ck-crowdy-studio-dsh-question-block{display:grid;gap:8px}
.ck-crowdy-studio-dsh-question-block[hidden]{display:none}
.ck-crowdy-studio-dsh-question-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ck-crowdy-studio-dsh-question-prompt{margin:0;color:#fff7ed;font-size:13px;line-height:1.5;white-space:pre-wrap}
.ck-crowdy-studio-dsh-question-answer{margin:0;color:#fde68a;font-size:13px;font-weight:650;line-height:1.45;white-space:pre-wrap}
.ck-crowdy-studio-dsh-question[data-answered="true"]{border-color:#ca8a04}
.ck-crowdy-studio-dsh-question-select{width:100%;border:1px solid #ca8a04;border-radius:8px;background:#1c1917;color:#fffbeb;padding:8px 10px;font-size:13px}
.ck-crowdy-studio-dsh-question-custom{width:100%;min-height:52px;resize:vertical;border:1px solid #ca8a04;border-radius:8px;background:#1c1917;color:#fffbeb;padding:8px 10px;font:inherit;font-size:13px;line-height:1.45}
.ck-crowdy-studio-dsh-question-custom:focus,.ck-crowdy-studio-dsh-question-select:focus{outline:2px solid #facc15;outline-offset:1px}
.ck-crowdy-studio-dsh-question-submit{justify-self:start;border:0;border-radius:999px;background:#eab308;color:#1c1917;font-weight:650;font-size:12px;padding:6px 12px;cursor:pointer}
.ck-crowdy-studio-dsh-question-submit:disabled{opacity:.4;cursor:default}
.ck-crowdy-studio-dsh-question-back{border:1px solid #ca8a04;border-radius:999px;background:transparent;color:#fde68a;font-weight:650;font-size:12px;padding:6px 12px;cursor:pointer}
.ck-crowdy-studio-dsh-question-back[hidden]{display:none}
.ck-crowdy-studio-dsh-live{display:flex;align-items:center;gap:6px;min-width:0;flex:1;max-width:42%;min-height:22px;padding:2px 8px;border-radius:999px;background:#1e1b4b;color:#c7d2fe;font-size:11px;font-weight:650}
.ck-crowdy-studio-dsh-live[hidden]{display:none}
.ck-crowdy-studio-dsh-working{display:flex;align-items:center;gap:10px;flex:none;min-height:36px;padding:8px 12px;border-top:1px solid var(--dsh-line);background:#12131a;color:var(--dsh-brand);font-size:12px;font-weight:600}
.ck-crowdy-studio-dsh-working[hidden]{display:none}
.ck-crowdy-studio-dsh-working-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c7d2fe}
.ck-crowdy-studio-dsh-dots{display:inline-flex;align-items:flex-end;gap:4px;height:12px;flex:none}
.ck-crowdy-studio-dsh-dots i{width:6px;height:6px;border-radius:50%;background:var(--dsh-brand);opacity:.35;animation:ck-dsh-dots .7s ease-in-out infinite}
.ck-crowdy-studio-dsh-dots i:nth-child(2){animation-delay:.12s}
.ck-crowdy-studio-dsh-dots i:nth-child(3){animation-delay:.24s}
.ck-crowdy-studio-dsh-error{margin:0;padding:6px 12px;color:#fecaca;font-size:12px;border-top:1px solid #7f1d1d}
.ck-crowdy-studio-dsh-composer{display:flex;align-items:flex-end;gap:8px;margin:0 12px 12px;padding:8px 8px 8px 12px;border:1px solid var(--dsh-line);border-radius:18px;background:var(--dsh-layer)}
.ck-crowdy-studio-dsh-composer textarea{flex:1;min-height:24px;max-height:160px;resize:none;background:transparent;color:var(--dsh-text);border:0;padding:4px 0;line-height:1.45}
.ck-crowdy-studio-dsh-composer textarea:focus{outline:none}
.ck-crowdy-studio-dsh-composer-actions{display:flex;align-items:center;gap:6px}
.ck-crowdy-studio-dsh-stop{border-color:#ef4444;color:#fecaca;border-radius:999px;padding:4px 10px;background:transparent}
.ck-crowdy-studio-dsh-send{width:32px;height:32px;padding:0;border-radius:50%;border:0;background:var(--dsh-brand);color:#fff;display:grid;place-items:center}
.ck-crowdy-studio-dsh-send svg{width:16px;height:16px;fill:currentColor}
.ck-crowdy-studio-dsh-send:disabled{opacity:.4}
@keyframes ck-dsh-dots{0%,80%,100%{opacity:.25;transform:translateY(0) scale(.85)}40%{opacity:1;transform:translateY(-4px) scale(1.15)}}
@keyframes ck-dsh-pulse{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}

.ck-crowdy-studio :focus-visible{outline:2px solid var(--ck-accent);outline-offset:2px}

/* Narrow widths: side panes become overlays so the editor keeps priority. */
@container(max-width:900px){.ck-crowdy-studio-settings{position:absolute;right:0;top:0;bottom:0;z-index:20;max-width:85%;border-left:1px solid var(--ck-line);box-shadow:-8px 0 24px rgba(2,6,23,.55)}.ck-crowdy-studio-splitter[data-orientation=vertical]{display:none}}
@container(max-width:760px){.ck-crowdy-studio-agent-dock,.ck-crowdy-studio-dsh-dock{position:absolute;right:0;top:0;bottom:0;z-index:22;max-width:92%;box-shadow:-8px 0 24px rgba(2,6,23,.55)}}
@container(max-width:620px){.ck-crowdy-studio-explorer{position:absolute;left:34px;top:0;bottom:0;z-index:21;max-width:85%;border-right:1px solid var(--ck-line);box-shadow:8px 0 24px rgba(2,6,23,.55)}}
`;
