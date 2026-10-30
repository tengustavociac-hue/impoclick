const { Card, Input, Select, Checkbox, Switch, SegmentedControl, Button, Stat, Badge, Breadcrumbs, DonutMeter, Legend, Toast, Icon } = window.ImpoclickDesignSystem_ec37fd;

const quoteSegments = [
  { value: 44, color: 'var(--chart-1)', label: 'Frete' },
  { value: 34, color: 'var(--chart-2)', label: 'Impostos' },
  { value: 12, color: 'var(--chart-3)', label: 'Despacho' },
  { value: 10, color: 'var(--chart-5)', label: 'Seguro e taxas' },
];

function QuoteScreen() {
  const [modal, setModal] = React.useState('sea');
  const [incoterm, setIncoterm] = React.useState('FOB');
  const [sent, setSent] = React.useState(false);
  const total = modal === 'sea' ? '86.400' : '142.900';
  const days = modal === 'sea' ? '32' : '9';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1080, margin: '0 auto' }}>
      <Breadcrumbs items={[{ label: 'Comercial', href: '#' }, { label: 'Nova cotação' }]} />
      <div>
        <h1 style={{ fontSize: 'var(--text-title-lg)' }}>Nova cotação</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Simule o custo total antes de fechar com o fornecedor.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card eyebrow="Etapa 1" title="Origem e destino">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Select label="Porto de origem" options={['Shenzhen (CNSZX)', 'Ningbo (CNNGB)', 'Xangai (CNSHA)']} />
              <Select label="Porto de destino" options={['Santos (BRSSZ)', 'Paranaguá (BRPNG)', 'Itajaí (BRITJ)']} />
              <Select label="Fornecedor" options={['Shenzhen Vitec', 'Ningbo Tools Co.', 'Foshan Home']} />
              <Select label="Incoterm" value={incoterm} onChange={e => setIncoterm(e.target.value)} options={['FOB', 'EXW', 'CIF', 'DDP']} />
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-title)' }}>Modal</span>
              <SegmentedControl accent value={modal} onChange={setModal}
                options={[{ value: 'sea', label: 'Marítimo', icon: 'directions_boat' }, { value: 'air', label: 'Aéreo', icon: 'flight' }]} />
            </div>
          </Card>

          <Card eyebrow="Etapa 2" title="Carga">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Input label="Valor FOB (US$)" placeholder="84.200,00" icon="payments" required />
              <Input label="Peso bruto (kg)" placeholder="18.420" icon="scale" required />
              <Input label="Volume (m³)" placeholder="58,4" icon="deployed_code" />
              <Input label="NCM principal" placeholder="8518.30.00" icon="tag" hint="Usada para estimar II e IPI" />
              <Select label="Tipo de contêiner" options={['40" HC', '20" DV', 'LCL (carga solta)']} />
              <Input label="Quantidade" placeholder="1" icon="inventory_2" />
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
              <Checkbox label="Incluir seguro internacional" defaultChecked />
              <Checkbox label="Carga perigosa (IMO)" />
              <Switch label="Entrega porta a porta" defaultChecked />
            </div>
          </Card>
        </div>

        <Card variant="accent" eyebrow="Estimativa" title="Custo desembarcado"
          style={{ position: 'sticky', top: 'calc(var(--nav-height) + 20px)' }}>
          <Stat prefix="US$" value={total} fraction=",00" size="md" />
          <div style={{ display: 'flex', gap: 8, margin: '16px 0 20px', flexWrap: 'wrap' }}>
            <Badge tone="neutral" icon="schedule">{days} dias porta a porta</Badge>
            <Badge tone="neutral">{incoterm}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <DonutMeter segments={quoteSegments} size={118} thickness={20} />
            <Legend items={quoteSegments} style={{ flexDirection: 'column', gap: 7 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            <Button variant="primary" block iconRight="arrow_outward" onClick={() => setSent(true)}>Solicitar cotação firme</Button>
            <Button variant="ghost" block>Salvar rascunho</Button>
          </div>
        </Card>
      </div>

      {sent && (
        <div style={{ position: 'fixed', left: 32, bottom: 28, zIndex: 80 }}>
          <Toast tone="success" actionLabel="Desfazer" onAction={() => setSent(false)}>Cotação enviada para 3 agentes de carga.</Toast>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { QuoteScreen });
