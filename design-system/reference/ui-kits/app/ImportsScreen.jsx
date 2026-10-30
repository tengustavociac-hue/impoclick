const { Card, Tabs, DataTable, Badge, Button, IconButton, Input, Select, Tag, EmptyState, Avatar, Breadcrumbs } = window.ImpoclickDesignSystem_ec37fd;

const ALL_ROWS = [
  { id: 'IMP-2481', code: 'MSKU 472 118-3', supplier: 'Shenzhen Vitec', origin: 'Shenzhen', status: 'Em trânsito', tone: 'accent', eta: '29 abr', value: 'US$ 84.200', bucket: 'transit' },
  { id: 'IMP-2483', code: 'TGHU 662 045-1', supplier: 'Ningbo Tools Co.', origin: 'Ningbo', status: 'Em trânsito', tone: 'accent', eta: '06 mai', value: 'US$ 42.710', bucket: 'transit' },
  { id: 'IMP-2479', code: 'TCLU 883 401-9', supplier: 'Foshan Home', origin: 'Foshan', status: 'Aguardando DI', tone: 'warning', eta: '18 abr', value: 'US$ 31.980', bucket: 'customs' },
  { id: 'IMP-2477', code: 'CAIU 190 338-7', supplier: 'Yiwu Trading', origin: 'Yiwu', status: 'Retido', tone: 'danger', eta: '—', value: 'US$ 18.400', bucket: 'customs' },
  { id: 'IMP-2470', code: 'HLXU 210 774-2', supplier: 'Dongguan Plast', origin: 'Dongguan', status: 'Entregue', tone: 'success', eta: '04 abr', value: 'US$ 112.430', bucket: 'done' },
  { id: 'IMP-2468', code: 'MSDU 774 902-5', supplier: 'Shenzhen Vitec', origin: 'Shenzhen', status: 'Entregue', tone: 'success', eta: '28 mar', value: 'US$ 66.150', bucket: 'done' },
];

function ImportsScreen({ setRoute }) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [filters, setFilters] = React.useState(['Origem: China']);
  const rows = ALL_ROWS
    .filter(r => tab === 'all' || r.bucket === tab)
    .filter(r => (r.id + r.supplier + r.code).toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1240, margin: '0 auto' }}>
      <Breadcrumbs items={[{ label: 'Operação', href: '#' }, { label: 'Importações' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title-lg)' }}>Importações</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>34 processos abertos · US$ 1,28 mi em trânsito</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" iconLeft="download">Exportar</Button>
          <Button variant="primary" iconLeft="add">Nova importação</Button>
        </div>
      </div>

      <Card compact>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <Input pill icon="search" placeholder="Buscar por referência, contêiner ou fornecedor" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div style={{ width: 180 }}><Select options={['Todos os modais', 'Marítimo', 'Aéreo']} /></div>
          <div style={{ width: 180 }}><Select options={['Últimos 90 dias', 'Este mês', 'Este ano']} /></div>
          <IconButton icon="tune" label="Mais filtros" />
        </div>
        {filters.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {filters.map(t => <Tag key={t} onRemove={() => setFilters(filters.filter(x => x !== t))}>{t}</Tag>)}
            <Button variant="ghost" size="sm" onClick={() => setFilters([])}>Limpar</Button>
          </div>
        )}
      </Card>

      <Card style={{ padding: '20px 8px 8px' }}>
        <div style={{ padding: '0 16px' }}>
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'all', label: 'Todas', badge: ALL_ROWS.length },
            { value: 'transit', label: 'Em trânsito', badge: 2 },
            { value: 'customs', label: 'Desembaraço', badge: 2 },
            { value: 'done', label: 'Concluídas', badge: 2 },
          ]} />
        </div>
        <div style={{ marginTop: 18 }}>
          {rows.length === 0
            ? <EmptyState icon="search_off" title="Nenhuma importação encontrada" action={<Button variant="outline" size="sm" onClick={() => { setQ(''); setTab('all'); }}>Limpar busca</Button>}>
              Ajuste o período, o status ou o termo buscado.
            </EmptyState>
            : <DataTable
              columns={[
                { key: 'id', label: 'Referência', primary: true },
                { key: 'code', label: 'Contêiner', render: r => <span className="ic-mono">{r.code}</span> },
                { key: 'supplier', label: 'Fornecedor', render: r => (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r.supplier} size="xs" />{r.supplier}</span>) },
                { key: 'origin', label: 'Origem' },
                { key: 'status', label: 'Status', render: r => <Badge tone={r.tone} dot>{r.status}</Badge> },
                { key: 'eta', label: 'ETA' },
                { key: 'value', label: 'Valor FOB', align: 'right' },
                { key: 'go', label: '', render: r => <IconButton icon="arrow_outward" label={'Abrir ' + r.id} variant="bare" size="sm" onClick={() => setRoute('embarque')} /> },
              ]}
              rows={rows} />}
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { ImportsScreen });
