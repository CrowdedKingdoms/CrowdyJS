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

/* Parallel DeepSeek Harness dock */
.ck-crowdy-studio-dsh-dock{flex:none;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;padding:10px;border-left:1px solid var(--ck-line);background:#0a1628;overflow:auto}
.ck-crowdy-studio-dsh-dock header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ck-crowdy-studio-dsh-dock h2{margin:0;font-size:13px}
.ck-crowdy-studio-dsh-status{color:var(--ck-muted);font-size:12px;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ck-crowdy-studio-dsh-status[data-error=true]{color:#fca5a5}
.ck-crowdy-studio-dsh-toolbar{display:flex;gap:6px}
.ck-crowdy-studio-dsh-sessions{display:flex;flex-wrap:wrap;gap:5px}
.ck-crowdy-studio-dsh-session[data-active=true]{border-color:var(--ck-accent);color:#bae6fd}
.ck-crowdy-studio-dsh-messages{display:flex;flex-direction:column;gap:6px;flex:1;min-height:120px;overflow:auto}
.ck-crowdy-studio-dsh-message{padding:7px;border:1px solid var(--ck-line);border-radius:5px;background:var(--ck-panel)}
.ck-crowdy-studio-dsh-message[data-role=USER]{border-color:#0e7490}
.ck-crowdy-studio-dsh-message[data-role=ASSISTANT]{border-color:#1d4ed8}
.ck-crowdy-studio-dsh-message p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.ck-crowdy-studio-dsh-empty{color:var(--ck-muted);margin:0;padding:4px 0}
.ck-crowdy-studio-dsh-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}
.ck-crowdy-studio-dsh-composer textarea{min-height:62px;resize:vertical;background:#0f172a;color:var(--ck-text);border:1px solid var(--ck-line);padding:7px}

.ck-crowdy-studio :focus-visible{outline:2px solid var(--ck-accent);outline-offset:2px}

/* Narrow widths: side panes become overlays so the editor keeps priority. */
@container(max-width:900px){.ck-crowdy-studio-settings{position:absolute;right:0;top:0;bottom:0;z-index:20;max-width:85%;border-left:1px solid var(--ck-line);box-shadow:-8px 0 24px rgba(2,6,23,.55)}.ck-crowdy-studio-splitter[data-orientation=vertical]{display:none}}
@container(max-width:760px){.ck-crowdy-studio-agent-dock,.ck-crowdy-studio-dsh-dock{position:absolute;right:0;top:0;bottom:0;z-index:22;max-width:92%;box-shadow:-8px 0 24px rgba(2,6,23,.55)}}
@container(max-width:620px){.ck-crowdy-studio-explorer{position:absolute;left:34px;top:0;bottom:0;z-index:21;max-width:85%;border-right:1px solid var(--ck-line);box-shadow:8px 0 24px rgba(2,6,23,.55)}}
`;
