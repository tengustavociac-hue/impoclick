const { Card, Stat, DataTable, Badge, Button, SegmentedControl, SparkBars, ProgressBar, Breadcrumbs, IconButton } = window.ImpoclickDesignSystem_ec37fd;

function CostsScreen() {
  const [period, setPeriod] = React.useState('12m');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1240, margin: '0 auto' }}>
      <Breadcrumbs items={[{ label: 'Financeiro', href: '#' }, { label: 'Custos' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title-lg)' }}>Custos de importação</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Custo desembarcado por processo, atualizado diariamente.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <SegmentedControl options={[{ value: '30d', label: '30 dias' }, { value: '12m', label: '12 meses' }]} value={period} onChange={setPeriod} />
          <Button variant="outline" iconLeft="download">Exportar CSV</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
        <Card compact><Stat label="Custo desembarcado" prefix="R$" value="4.128.940" size="sm" delta="+6,8%" deltaNote="vs. ano anterior" /></Card>
        <Card compact><Stat label="Custo médio / contêiner" prefix="R$" value="31.280" size="sm" delta="-3,1%" deltaDirection="down" deltaNote="melhor" /></Card>
        <Card compact><Stat label="Impostos pagos" prefix="R$" value="1.402.110" size="sm" /></Card>
        <Card compact><Stat label="Armazenagem evitada" prefix="R$" value="86.400" size="sm" delta="18 dias" deltaDirection="flat" /></Card>
      </div>

      <Card eyebrow="Tendência" title="Custo desembarcado por mês">
        <SparkBars height={150}
          data={[286, 312, 274, 341, 388, 352, 401, 368, 392, 447, 376, 349]}
          labels={['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set']} />
      </Card>

      <Card eyebrow="Detalhe" title="Por processo"
        action={<IconButton icon="tune" label="Colunas" variant="bare" size="sm" />}>
        <DataTable columns={[
          { key: 'id', label: 'Referência', primary: true },
          { key: 'route', label: 'Rota' },
          { key: 'fob', label: 'FOB', align: 'right' },
          { key: 'freight', label: 'Frete', align: 'right' },
          { key: 'tax', label: 'Impostos', align: 'right' },
          { key: 'landed', label: 'Desembarcado', align: 'right' },
          { key: 'margin', label: 'Margem', render: r => <div style={{ minWidth: 120 }}><ProgressBar value={r.m} valueText={r.m + '%'} tone={r.m > 35 ? 'success' : r.m > 22 ? 'accent' : 'danger'} /></div> },
        ]} rows={[
          { id: 'IMP-2481', route: 'Shenzhen → Santos', fob: 'US$ 84.200', freight: 'R$ 62.900', tax: 'R$ 148.300', landed: 'R$ 612.480', m: 38 },
          { id: 'IMP-2479', route: 'Foshan → Santos', fob: 'US$ 31.980', freight: 'R$ 41.200', tax: 'R$ 62.700', landed: 'R$ 271.140', m: 27 },
          { id: 'IMP-2477', route: 'Yiwu → Paranaguá', fob: 'US$ 18.400', freight: 'R$ 38.900', tax: 'R$ 39.100', landed: 'R$ 183.620', m: 16 },
          { id: 'IMP-2470', route: 'Dongguan → Itajaí', fob: 'US$ 112.430', freight: 'R$ 74.400', tax: 'R$ 201.800', landed: 'R$ 842.010', m: 44 },
        ]} />
      </Card>
    </div>
  );
}

Object.assign(window, { CostsScreen });
