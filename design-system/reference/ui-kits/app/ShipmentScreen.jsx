const { Card, Stat, Badge, Button, IconButton, Timeline, ProgressBar, DataTable, Breadcrumbs, Tabs, Alert, Avatar, Icon, Tooltip } = window.ImpoclickDesignSystem_ec37fd;

function ShipmentScreen({ setRoute }) {
  const [tab, setTab] = React.useState('rota');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1240, margin: '0 auto' }}>
      <Breadcrumbs items={[{ label: 'Importações', href: '#' }, { label: 'IMP-2481' }]} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'var(--text-title-lg)' }}>Shenzhen → Santos</h1>
            <Badge tone="accent" dot>Em trânsito</Badge>
          </div>
          <p className="ic-mono" style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>IMP-2481 · MSKU 472 118-3 · BL SZX0482914</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Tooltip label="Baixar documentos"><IconButton icon="download" label="Baixar" /></Tooltip>
          <Button variant="outline" iconLeft="chat">Falar com o despachante</Button>
          <Button variant="primary" iconLeft="upload_file">Enviar documento</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
        <Card compact><Stat label="Valor FOB" prefix="US$" value="84.200" fraction=",00" size="sm" /></Card>
        <Card compact><Stat label="Custo total estimado" prefix="R$" value="612.480" fraction=",00" size="sm" delta="+4,2%" deltaDirection="up" deltaNote="vs. cotação" /></Card>
        <Card compact><Stat label="Peso bruto" value="18.420" suffix="kg" size="sm" /></Card>
        <Card compact><Stat label="Chegada prevista" value="29" suffix="abr" size="sm" delta="14 dias" deltaDirection="flat" /></Card>
      </div>

      <Alert tone="info" title="Rastreio atualizado há 22 minutos">
        Última posição informada pela MSC: 12°44′S 38°30′W, velocidade 16,4 nós.
      </Alert>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Card eyebrow="Trajeto" title="Etapas do embarque">
          <div style={{ marginBottom: 20 }}>
            <ProgressBar thick label="Progresso do trajeto" valueText="18 / 32 dias" value={18} max={32} />
          </div>
          <Timeline steps={[
            { title: 'Pedido confirmado', date: '24 mar', meta: 'Shenzhen Vitec', state: 'done', icon: 'handshake' },
            { title: 'Coleta no fornecedor', date: '02 abr', meta: 'Guangzhou', state: 'done', icon: 'factory' },
            { title: 'Embarque · Shenzhen', date: '07 abr', meta: 'MSC Bianca · Viagem 418W', state: 'done', icon: 'directions_boat' },
            { title: 'Em trânsito marítimo', date: 'prev. 29 abr', meta: 'Atlântico Sul · 14 dias restantes', state: 'current', icon: 'public' },
            { title: 'Atracação · Santos', state: 'todo', icon: 'anchor' },
            { title: 'Desembaraço aduaneiro', state: 'todo', icon: 'gavel' },
            { title: 'Entrega · Curitiba', state: 'todo', icon: 'local_shipping' },
          ]} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '20px 8px 8px' }}>
            <div style={{ padding: '0 16px' }}>
              <Tabs value={tab} onChange={setTab} items={[
                { value: 'rota', label: 'Itens', badge: 3 },
                { value: 'docs', label: 'Documentos', badge: 5 },
              ]} />
            </div>
            <div style={{ marginTop: 16 }}>
              {tab === 'rota'
                ? <DataTable columns={[
                  { key: 'item', label: 'Produto', primary: true },
                  { key: 'ncm', label: 'NCM', render: r => <span className="ic-mono">{r.ncm}</span> },
                  { key: 'qty', label: 'Qtd.', align: 'right' },
                  { key: 'total', label: 'Total FOB', align: 'right' },
                ]} rows={[
                  { item: 'Fone bluetooth TWS', ncm: '8518.30.00', qty: '4.800', total: 'US$ 38.400' },
                  { item: 'Carregador 65W GaN', ncm: '8504.40.90', qty: '3.200', total: 'US$ 28.800' },
                  { item: 'Cabo USB-C 2 m', ncm: '8544.42.00', qty: '9.000', total: 'US$ 17.000' },
                ]} />
                : <DataTable columns={[
                  { key: 'doc', label: 'Documento', primary: true },
                  { key: 'who', label: 'Enviado por', render: r => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r.who} size="xs" />{r.who}</span> },
                  { key: 'status', label: 'Status', render: r => <Badge tone={r.tone} dot>{r.status}</Badge> },
                ]} rows={[
                  { doc: 'Commercial Invoice', who: 'Ana Sousa', status: 'Aprovado', tone: 'success' },
                  { doc: 'Packing List', who: 'Ana Sousa', status: 'Aprovado', tone: 'success' },
                  { doc: 'Bill of Lading', who: 'MSC', status: 'Aprovado', tone: 'success' },
                  { doc: 'Certificado de origem', who: 'Shenzhen Vitec', status: 'Em análise', tone: 'warning' },
                  { doc: 'Licença de importação', who: '—', status: 'Pendente', tone: 'neutral' },
                ]} />}
            </div>
          </Card>

          <Card variant="invert" eyebrow="Parceiro" title="Shenzhen Vitec Electronics"
            action={<IconButton icon="arrow_outward" label="Abrir fornecedor" variant="bare" size="sm" />}>
            <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
              {[['Embarques', '14'], ['Prazo médio', '31 d'], ['Avarias', '0,4%']].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{k}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ShipmentScreen });
