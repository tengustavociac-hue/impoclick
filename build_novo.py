import re

with open('index.backup.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace app-container with app-shell
html = html.replace('<div class="app-container hidden">', '<div class="app-shell hidden">')
html = html.replace('<div class="main-content">', '<div class="content-area">')

# Replace sidebar
sidebar_old_start = html.find('<!-- Left Navigation Sidebar -->')
sidebar_old_end = html.find('</aside>', sidebar_old_start) + len('</aside>')

sidebar_new = """<!-- Left Navigation Sidebar -->
        <aside class="sidebar glass">
            <div class="brand">
                <div class="brand-mark">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 12h6"/></svg>
                </div>
                <span class="brand-name">Impoclick</span>
            </div>
            
            <div class="nav-group">
                <span class="nav-eyebrow">Operação</span>
                <button class="nav-item active" data-view="view-calculator">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
                    Calculadora de Rateio
                </button>
                <button class="nav-item" data-view="view-imports">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Histórico de Importação
                </button>
                <button class="nav-item" data-view="view-feasibility">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    Viabilidade
                </button>
            </div>

            <div class="nav-group">
                <span class="nav-eyebrow">Documentos</span>
                <div class="nav-dropdown-group open">
                    <button class="nav-item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Documentações
                    </button>
                    <div class="nav-sub">
                        <span class="nav-sub-item" data-view="view-doc-proforma">Proforma Invoice</span>
                        <span class="nav-sub-item" data-view="view-doc-commercial">Commercial Invoice</span>
                        <span class="nav-sub-item" data-view="view-doc-packing">Packing List</span>
                    </div>
                </div>
            </div>

            <div class="nav-group">
                <span class="nav-eyebrow">Conta</span>
                <div class="nav-dropdown-group open">
                    <button class="nav-item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        Cadastros
                    </button>
                    <div class="nav-sub">
                        <span class="nav-sub-item" data-view="view-cad-empresa">Empresa</span>
                        <span class="nav-sub-item" data-view="view-cad-produtos">Produtos</span>
                    </div>
                </div>
                <button class="nav-item" data-view="view-settings">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Configurações
                </button>
            </div>
            
            <div class="sidebar-foot" style="margin-top: auto; padding: 0.9rem; border: 1px solid var(--border-color); border-radius: var(--border-radius-md); background: var(--bg-input); font-size: 0.7rem; font-weight: 600; color: var(--text-faint); line-height: 1.7;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--success); margin-right: 5px; box-shadow: 0 0 8px var(--success);"></span><b style="color: var(--text-muted);">IMPOCLICK</b><br>
                conta conectada
            </div>
        </aside>"""

html = html[:sidebar_old_start] + sidebar_new + html[sidebar_old_end:]

# Now replace view-calculator config area
# Find start of side configs
conf_start = html.find('<!-- SIDEBAR: CONFIGS -->')
conf_end = html.find('<!-- SECTION: ADICIONAR PRODUTOS -->')

conf_new = """<!-- SIDEBAR: CONFIGS -->
            <div class="config-col" style="display: flex; flex-direction: column; gap: 1.1rem; width: 300px; flex-shrink: 0;">
                <!-- CARD: CAMBIO & MOEDA -->
                <div class="card glass">
                    <h3 class="card-title">
                        <span class="icon-chip" style="width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:var(--gradient-brand);"><svg width="15" height="15" color="#1a1305" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
                        Moeda e Câmbio
                    </h3>
                    
                    <div class="field">
                        <label>Cálculo de Câmbio</label>
                        <div class="toggle-row">
                            <input type="radio" id="exch-simple" name="exchange-mode" value="simple" checked><label for="exch-simple">Simplificado</label>
                            <input type="radio" id="exch-complete" name="exchange-mode" value="complete"><label for="exch-complete">Completo</label>
                        </div>
                    </div>

                    <div class="currency-pair-block">
                        <div class="field">
                            <label>Moeda Origem</label>
                            <div class="input-group">
                                <select id="select-currency">
                                    <option value="USD">Dólar (USD - $)</option>
                                    <option value="EUR">Euro (EUR - €)</option>
                                    <option value="BRL">Real (BRL - R$)</option>
                                </select>
                            </div>
                        </div>
                        <div class="field" id="exchange-rate-group">
                            <label>Cotação Oficial (R$)</label>
                            <div class="input-group"><span class="input-prefix">R$</span><input type="number" id="input-exchange-rate" value="5.50" step="0.01" min="0.01"></div>
                        </div>
                    </div>
                    
                    <div class="currency-pair-block hidden" id="exchange-markup-group">
                        <div class="field">
                            <label>Spread Bancário (%)</label>
                            <div class="input-group"><input type="number" id="input-spread" value="4.0" step="0.1" min="0"><span class="input-prefix">%</span></div>
                        </div>
                        <div class="field">
                            <label>IOF (%)</label>
                            <div class="input-group">
                                <select id="input-iof">
                                    <option value="2.38">Cartão Crédito (2,38%)</option>
                                    <option value="1.10">Conta Global (1,10%)</option>
                                    <option value="0.38">Boleto / PIX (0,38%)</option>
                                    <option value="0.00">Sem IOF (0,00%)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="effective-rate" id="effective-rate-container">
                        <span>Câmbio Efetivo</span>
                        <strong id="display-effective-rate">R$ 5,75</strong>
                    </div>
                </div>

                <!-- CARD: CUSTOS GLOBAIS -->
                <div class="card glass">
                    <h3 class="card-title">
                        <span class="icon-chip" style="width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:var(--gradient-brand);"><svg width="15" height="15" color="#1a1305" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                        Custos do Pacote
                    </h3>
                    
                    <div class="field">
                        <div class="label-with-toggle" style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="margin:0;">Frete Global</label>
                            <label class="toggle-switch" style="transform: scale(0.8);">
                                <input type="checkbox" id="freight-in-brl">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="input-group"><span class="input-prefix" id="freight-prefix">US$</span><input type="number" id="input-freight" value="0.00" step="0.01" min="0"></div>
                    </div>

                    <div class="field">
                        <div class="label-with-toggle" style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="margin:0;">Seguro Global</label>
                            <label class="toggle-switch" style="transform: scale(0.8);">
                                <input type="checkbox" id="insurance-in-brl">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="input-group"><span class="input-prefix" id="insurance-prefix">US$</span><input type="number" id="input-insurance" value="0.00" step="0.01" min="0"></div>
                    </div>

                    <div class="field">
                        <div class="label-with-toggle" style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="margin:0;">Outras Taxas</label>
                            <label class="toggle-switch" style="transform: scale(0.8);">
                                <input type="checkbox" id="fees-in-brl" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="input-group"><span class="input-prefix" id="fees-prefix">R$</span><input type="number" id="input-other-fees" value="0.00" step="0.01" min="0"></div>
                    </div>
                </div>

                <!-- CARD: CONFIG DE IMPOSTOS -->
                <div class="card glass">
                    <h3 class="card-title">
                        <span class="icon-chip" style="width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:var(--gradient-brand);"><svg width="15" height="15" color="#1a1305" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                        Impostos e Tributos
                    </h3>

                    <div class="field">
                        <label>Modo de Cálculo de Impostos</label>
                        <div class="toggle-row">
                            <input type="radio" id="tax-auto" name="tax-mode" value="auto" checked><label for="tax-auto">Automático</label>
                            <input type="radio" id="tax-manual" name="tax-mode" value="manual"><label for="tax-manual">Manual</label>
                        </div>
                    </div>

                    <div id="tax-auto-fields">
                        <div class="field">
                            <label>Regime de Importação</label>
                            <div class="input-group">
                                <select id="select-tax-regime">
                                    <option value="remessa-conforme">Remessa Conforme</option>
                                    <option value="regra-geral">Regra Geral 60%</option>
                                    <option value="importacao-formal">Importação Formal</option>
                                    <option value="apenas-icms">Apenas ICMS</option>
                                    <option value="personalizado">Personalizado</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid-2 hidden" id="custom-tax-rates" style="display:flex; gap:0.5rem;">
                            <div class="field" style="flex:1;">
                                <label>Aliq. II (%)</label>
                                <div class="input-group"><input type="number" id="input-custom-ii" value="60" min="0" max="100"></div>
                            </div>
                            <div class="field" style="flex:1;">
                                <label>Aliq. ICMS (%)</label>
                                <div class="input-group"><input type="number" id="input-custom-icms" value="17" min="0" max="100"></div>
                            </div>
                        </div>

                        <div class="field" id="icms-rate-group">
                            <label>Alíquota de ICMS Estadual (%)</label>
                            <div class="input-group"><input type="number" id="input-icms-rate" value="17" min="0" max="100"><span class="input-prefix">%</span></div>
                        </div>
                    </div>

                    <div id="tax-manual-fields" class="hidden">
                        <div class="field">
                            <label>Total II Pago (R$)</label>
                            <div class="input-group"><span class="input-prefix">R$</span><input type="number" id="input-manual-ii" value="0.00" step="0.01" min="0"></div>
                        </div>
                        <div class="field">
                            <label>Total ICMS Pago (R$)</label>
                            <div class="input-group"><span class="input-prefix">R$</span><input type="number" id="input-manual-icms" value="0.00" step="0.01" min="0"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MAIN PANELS: PRODUCTS & RESULTS -->
            <div class="main-col" style="flex: 1; display: flex; flex-direction: column; gap: 1.1rem; overflow:hidden;">
                <!-- SECTION: ADICIONAR PRODUTOS -->"""

html = html[:conf_start] + conf_new + html[conf_end:]

# Now replace the results area
results_start = html.find('<!-- KPI CARDS GRID -->')
results_end = html.find('<!-- CARD: RESULTADOS DETALHADOS POR PRODUTO -->')

results_new = """<!-- KPI CARDS GRID -->
                    <div class="stat-row">
                        <div class="stat glass">
                            <div class="stat-label">Valor FOB</div>
                            <div class="stat-value" id="kpi-fob-brl">R$ 0,00</div>
                        </div>
                        <div class="stat glass">
                            <div class="stat-label">Impostos (II + ICMS)</div>
                            <div class="stat-value" id="kpi-taxes-brl">R$ 0,00</div>
                        </div>
                        <div class="stat glass">
                            <div class="stat-label">Custo Final do Lote</div>
                            <div class="stat-value gradient" id="kpi-final-total-brl">R$ 0,00</div>
                        </div>
                        <div class="stat glass">
                            <div class="stat-label">Fator BRL/FOB</div>
                            <div class="stat-value" id="kpi-multiplier-total">0.00x</div>
                        </div>
                    </div>

                    <!-- CARD: RESULTADOS DETALHADOS POR PRODUTO -->"""

html = html[:results_start] + results_new + html[results_end:]

# Inject styles from new design at the end of head
head_end = html.find('</head>')
styles = """
    <style>
      .app-shell {
        display: grid;
        grid-template-columns: 236px 1fr;
        gap: 1.1rem;
        padding: 1.1rem;
        min-height: 100vh;
        align-items: start;
      }
      .glass {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-lg);
        backdrop-filter: blur(22px) saturate(140%);
        -webkit-backdrop-filter: blur(22px) saturate(140%);
        box-shadow: var(--card-shadow);
      }
      .sidebar {
        padding: 1.4rem 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 1.6rem;
        position: sticky;
        top: 1.1rem;
        height: calc(100vh - 2.2rem);
      }
      .brand { display: flex; align-items: center; gap: 0.7rem; padding: 0 0.2rem; }
      .brand-mark {
        width: 38px; height: 38px;
        border-radius: 14px;
        background: var(--gradient-brand);
        display: grid; place-items: center;
        flex-shrink: 0;
        box-shadow: 0 6px 18px -4px rgba(180, 130, 20, 0.5);
      }
      .brand-mark svg { width: 20px; height: 20px; color: #1a1305; }
      .brand-name {
        font-family: var(--font-primary);
        font-weight: 700;
        font-size: 1.1rem;
        letter-spacing: -0.01em;
      }
      .nav-group { display: flex; flex-direction: column; gap: 0.2rem; }
      .nav-eyebrow {
        font-family: var(--font-secondary);
        font-size: 0.64rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-faint);
        padding: 0 0.7rem;
        margin-bottom: 0.35rem;
      }
      .nav-item {
        display: flex; align-items: center; gap: 0.65rem;
        padding: 0.62rem 0.75rem;
        border-radius: var(--border-radius-sm);
        font-size: 0.87rem; font-weight: 700;
        color: var(--text-muted);
        cursor: pointer;
        border: 1px solid transparent;
        background: none;
        width: 100%; text-align: left;
        font-family: var(--font-secondary);
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .nav-item svg { width: 17px; height: 17px; flex-shrink: 0; opacity: 0.8; }
      .nav-item:hover { background: var(--bg-input); color: var(--text-primary); }
      .nav-item.active {
        background: var(--gradient-brand);
        color: #1a1305;
        box-shadow: 0 6px 20px -6px rgba(180, 130, 20, 0.55);
      }
      .nav-item.active svg { opacity: 1; }
      
      .content-area { display: flex; flex-direction: column; gap: 1.1rem; width: 100%; }
      .app-main { display: flex; gap: 1.1rem; align-items: flex-start; }
      
      .field { margin-bottom: 1.05rem; }
      .field label {
        display: block; font-size: 0.7rem; font-weight: 800;
        color: var(--text-faint); margin-bottom: 0.4rem;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .input-group {
        display: flex; align-items: center;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        background: var(--bg-input);
        overflow: hidden;
      }
      .input-prefix {
        padding: 0 0.65rem;
        font-family: var(--font-secondary);
        font-weight: 700;
        font-size: 0.78rem; color: var(--text-faint);
        border-right: 1px solid var(--border-color);
        height: 2.3rem; display: flex; align-items: center;
      }
      .input-group input, .input-group select {
        border: none; background: transparent;
        padding: 0 0.75rem; height: 2.3rem;
        font-family: var(--font-secondary); font-weight: 700; font-size: 0.87rem;
        color: var(--text-primary); width: 100%;
        font-variant-numeric: tabular-nums;
      }
      .input-group input:focus, .input-group select:focus {
        outline: 2px solid var(--primary); outline-offset: -1px;
      }
      .toggle-row {
        display: flex; background: var(--bg-input);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        padding: 3px; gap: 3px;
      }
      .toggle-row label {
        flex: 1; text-align: center; padding: 0.48rem 0;
        font-size: 0.78rem; font-weight: 700; color: var(--text-muted);
        border-radius: 9px; cursor: pointer; margin: 0;
      }
      .toggle-row input { display: none; }
      .toggle-row input:checked + label {
        background: var(--gradient-brand); color: #1a1305;
      }
      .effective-rate {
        margin-top: 1rem;
        padding: 0.8rem 0.9rem;
        border-radius: var(--border-radius-sm);
        background: linear-gradient(120deg, rgba(234,179,8,0.14), rgba(146,101,10,0.08));
        border: 1px solid var(--glass-border-strong);
        display: flex; justify-content: space-between; align-items: center;
        font-size: 0.82rem; font-weight: 700;
      }
      .effective-rate strong {
        font-family: var(--font-secondary); font-weight: 800; font-size: 1.05rem;
        background: var(--gradient-text);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        font-variant-numeric: tabular-nums;
      }

      .stat-row {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 0.9rem; margin-bottom: 1.1rem;
      }
      .stat { padding: 1.05rem 1.15rem; position: relative; overflow: hidden; }
      .stat::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
        background: var(--gradient-brand);
        border-radius: var(--border-radius-lg) var(--border-radius-lg) 0 0;
      }
      .stat-label {
        font-size: 0.68rem; font-weight: 800; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--text-faint); margin-bottom: 0.5rem;
      }
      .stat-value {
        font-family: var(--font-secondary); font-size: 1.4rem; font-weight: 800;
        font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
      }
      .stat-value.gradient {
        background: var(--gradient-text);
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }
      
      .table-results { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
      .table-results thead th {
        text-align: left; padding: 0.75rem 1.3rem;
        font-size: 0.67rem; font-weight: 800; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--text-faint);
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
      }
      .table-results tbody td {
        padding: 0.85rem 1.3rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary); white-space: nowrap;
        font-weight: 600;
      }
      .table-results tbody tr:hover td { background: var(--bg-input); }
    </style>
"""
html = html[:head_end] + styles + html[head_end:]

panel = '''
<div style="position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); padding:10px 14px; border-radius:12px; border:1px solid rgba(245, 196, 81, 0.3); z-index:9999; display:flex; gap:10px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); align-items:center; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
    <span style="color:#f7ecd8; font-family:var(--font-secondary); font-size:0.75rem; font-weight:700; margin-right:5px; text-transform:uppercase; letter-spacing:0.05em;">Cor do Fundo:</span>
    <button onclick="document.body.className=''" style="width:24px; height:24px; border-radius:50%; border:2px solid #f5c451; background:#1a150e; cursor:pointer;" title="Mocha (Padrão Atual)"></button>
    <button onclick="document.body.className='theme-navy'" style="width:24px; height:24px; border-radius:50%; border:2px solid #f5c451; background:#08111e; cursor:pointer;" title="Azul Marinho"></button>
    <button onclick="document.body.className='theme-emerald'" style="width:24px; height:24px; border-radius:50%; border:2px solid #f5c451; background:#061c14; cursor:pointer;" title="Verde Esmeralda"></button>
    <button onclick="document.body.className='theme-wine'" style="width:24px; height:24px; border-radius:50%; border:2px solid #f5c451; background:#1a080a; cursor:pointer;" title="Vinho Bordô"></button>
    <button onclick="document.body.className='theme-royal'" style="width:24px; height:24px; border-radius:50%; border:2px solid #f5c451; background:#140b1c; cursor:pointer;" title="Roxo Royal"></button>
</div>
</body>'''

html = html.replace('</body>', panel)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Updated index.html successfully!")
