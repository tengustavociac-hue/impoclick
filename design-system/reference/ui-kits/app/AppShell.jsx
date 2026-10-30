const { TopBar, NavPills, SideNav, IconButton, Avatar, SegmentedControl, Icon } = window.ImpoclickDesignSystem_ec37fd;

function ThemeToggle({ theme, setTheme }) {
  return (
    <SegmentedControl
      options={[{ value: 'light', label: 'Claro', icon: 'light_mode' }, { value: 'dark', label: 'Escuro', icon: 'dark_mode' }]}
      value={theme} onChange={setTheme} />
  );
}

function AppShell({ route, setRoute, theme, setTheme, children }) {
  const railTop = route;
  return (
    <div style={{ minHeight: '100%', background: 'var(--surface-page)' }}>
      <TopBar
        brand={<><img src="../../../assets/logo-impoclick.png" alt="" />Impoclick</>}
        center={<NavPills
          items={[{ value: 'painel', label: 'Painel' }, { value: 'importacoes', label: 'Importações' }, { value: 'cotacao', label: 'Cotação' }, { value: 'custos', label: 'Custos' }]}
          value={route === 'embarque' ? 'importacoes' : route} onChange={setRoute} />}
        actions={<>
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <IconButton icon="search" label="Buscar" size="sm" />
          <IconButton icon="notifications" label="Avisos" size="sm" />
          <Avatar name="Rafael Lima" size="sm" />
        </>} />
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - var(--nav-height))' }}>
        <SideNav
          value={railTop} onChange={setRoute}
          items={[
            { group: 'Operação' },
            { value: 'painel', icon: 'dashboard', label: 'Painel' },
            { value: 'importacoes', icon: 'inventory_2', label: 'Importações', count: 12 },
            { value: 'embarque', icon: 'directions_boat', label: 'Rastreio' },
            { group: 'Comercial' },
            { value: 'cotacao', icon: 'request_quote', label: 'Cotação' },
            { value: 'fornecedores', icon: 'factory', label: 'Fornecedores', count: 27 },
            { group: 'Financeiro' },
            { value: 'custos', icon: 'payments', label: 'Custos' },
            { value: 'docs', icon: 'receipt_long', label: 'Documentos', count: 3 },
          ]}
          footer={<div style={{ marginTop: 'auto', paddingTop: 24 }}>
            <div style={{ background: 'var(--surface-raised)', borderRadius: 'var(--radius-md)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                <Icon name="bolt" size={18} filled />Plano Comex Pro
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>18 de 40 contêineres usados neste mês.</div>
            </div>
          </div>} />
        <main style={{ flex: 1, minWidth: 0, padding: '28px 32px 48px' }}>{children}</main>
      </div>
    </div>
  );
}

Object.assign(window, { AppShell, ThemeToggle });
