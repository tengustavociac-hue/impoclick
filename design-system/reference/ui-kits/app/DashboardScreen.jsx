const { Card, Stat, Badge, Button, IconButton, SegmentedControl, SparkBars, DonutMeter, Legend, Timeline, ProgressBar, Alert, Avatar, Icon } = window.ImpoclickDesignSystem_ec37fd;

const costSegments = [
  { value: 46, color: 'var(--chart-1)', label: 'Frete internacional' },
  { value: 31, color: 'var(--chart-2)', label: 'Impostos' },
  { value: 14, color: 'var(--chart-3)', label: 'Armazenagem' },
  { value: 9, color: 'var(--chart-5)', label: 'Outros' },
];

function DashboardScreen({ setRoute }) {
  const [period, setPeriod] = React.useState('30d');
  const [currency, setCurrency] = React.useState('USD');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Terça, 16 de setembro</div>
          <h1 style={{ fontSize: 'var(--text-title-lg)', marginTop: 4 }}>Olá, Rafael</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SegmentedControl options={[{ value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '12m', label: '12 meses' }]} value={period} onChange={setPeriod} />
          <Button variant="primary" iconLeft="add">Nova importação</Button>
        </div>
      </div>

      <Alert tone="warning" title="2 embarques aguardam documentos">
        A DI do IMP-2479 vence em 3 dias. Envie a fatura comercial para evitar armazenagem no porto de Santos.
      </Alert>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, alignItems: 'stretch' }}>
        <Card variant="accent" eyebrow="Valor em trânsito"
          action={<SegmentedControl options={['USD', 'BRL']} value={currency} onChange={setCurrency} />}>
          <Stat prefix={currency === 'USD' ? 'US$' : 'R$'} value={currency === 'USD' ? '1.284.600' : '6.873.610'} fraction=",00"
            delta="+12,4%" deltaNote="vs. período anterior" size="lg" />
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <Button variant="outline" size="sm" iconLeft="download">Extrato</Button>
            <Button variant="outline" size="sm" iconLeft="share">Compartilhar</Button>
          </div>
        </Card>

        <Card eyebrow="Contêineres" title="Ocupação do plano"
          action={<IconButton icon="arrow_outward" label="Abrir" variant="bare" size="sm" />}>
          <Stat value="18" fraction="/ 40" size="md" delta="+3" deltaNote="nesta semana" />
          <div style={{ marginTop: 18 }}>
            <ProgressBar value={18} max={40} valueText="45%" label="Uso mensal" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <Badge tone="accent" dot>12 em trânsito</Badge>
            <Badge tone="warning" dot>4 no porto</Badge>
            <Badge tone="success" dot>2 entregues</Badge>
          </div>
        </Card>

        <Card eyebrow="Composição de custo" title="Últimos 30 dias"
          action={<IconButton icon="arrow_outward" label="Abrir" variant="bare" size="sm" />}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <DonutMeter segments={costSegments} size={132} thickness={22} value="US$ 84,2k" label="Custo total" />
            <Legend items={costSegments} style={{ flexDirection: 'column', gap: 8 }} />
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Card eyebrow="Volume" title="Embarques por semana"
          action={<SegmentedControl options={[{ value: 's', label: 'Marítimo' }, { value: 'a', label: 'Aéreo' }]} value="s" onChange={() => { }} />}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18 }}>
            <Stat value="132" suffix="contêineres" size="sm" delta="+8,1%" deltaNote="vs. trimestre anterior" />
          </div>
          <SparkBars data={[9, 14, 11, 18, 22, 16, 27, 19, 24, 31, 21, 17]} height={132}
            labels={['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set']} />
        </Card>

        <Card eyebrow="IMP-2481" title="Shenzhen → Santos"
          action={<IconButton icon="arrow_outward" label="Abrir embarque" variant="bare" size="sm" onClick={() => setRoute('embarque')} />}>
          <Timeline steps={[
            { title: 'Coleta no fornecedor', date: '02 abr', meta: 'Guangzhou', state: 'done', icon: 'factory' },
            { title: 'Embarque · Shenzhen', date: '07 abr', meta: 'MSC Bianca', state: 'done', icon: 'directions_boat' },
            { title: 'Em trânsito marítimo', date: 'prev. 29 abr', meta: '14 dias restantes', state: 'current', icon: 'public' },
            { title: 'Desembaraço · Santos', state: 'todo', icon: 'gavel' },
            { title: 'Entrega · Curitiba', state: 'todo', icon: 'local_shipping' },
          ]} />
        </Card>
      </div>

      <Card eyebrow="Equipe" title="Atividade recente" compact>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            ['Ana Sousa', 'anexou a fatura comercial em', 'IMP-2479', 'há 12 min'],
            ['Marcos Dias', 'aprovou a cotação de', 'Ningbo Tools Co.', 'há 1 h'],
            ['Rafael Lima', 'criou a importação', 'IMP-2483', 'ontem'],
          ].map(([who, what, ref, when], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--border-subtle)' : 'none', fontSize: 14 }}>
              <Avatar name={who} size="sm" />
              <span style={{ color: 'var(--text-body)' }}>
                <b style={{ color: 'var(--text-title)', fontWeight: 600 }}>{who}</b> {what} <b style={{ color: 'var(--accent)', fontWeight: 600 }}>{ref}</b>
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{when}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { DashboardScreen });
