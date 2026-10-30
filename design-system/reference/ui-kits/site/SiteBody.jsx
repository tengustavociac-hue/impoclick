const { Button, Card, Stat, Badge, Icon, Input, Timeline, Avatar, IconButton } = window.ImpoclickDesignSystem_ec37fd;

const siteFeatures = [
  { icon: 'radar', title: 'Rastreio em tempo real', body: 'Posição do navio, ETA recalculada e alerta quando o contêiner atraca — sem abrir o site da armadora.' },
  { icon: 'calculate', title: 'Custo desembarcado', body: 'II, IPI, PIS, COFINS, ICMS, frete e armazenagem calculados por NCM antes de você fechar o pedido.' },
  { icon: 'description', title: 'Documentos num lugar só', body: 'Invoice, packing list, BL e certificados anexados ao processo e compartilhados com o despachante.' },
  { icon: 'factory', title: 'Histórico por fornecedor', body: 'Prazo médio, índice de avaria e divergências de NCM de cada fábrica com quem você já trabalhou.' },
  { icon: 'notifications_active', title: 'Alertas que evitam custo', body: 'Avisos de vencimento de DI e de free time para você não pagar armazenagem por esquecimento.' },
  { icon: 'group', title: 'Time e despachante juntos', body: 'Comentários e aprovações no próprio processo. Ninguém mais procura o anexo no WhatsApp.' },
];

function Features() {
  return (
    <Section>
      <div style={{ maxWidth: '54ch', marginBottom: 48 }}>
        <Eyebrow>Plataforma</Eyebrow>
        <h2 style={{ fontSize: 'clamp(30px,4vw,44px)', letterSpacing: '-.03em', lineHeight: 1.1, marginTop: 20 }}>
          Seis planilhas, três grupos de WhatsApp e um despachante — substituídos por uma tela.
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        {siteFeatures.map(f => (
          <Card key={f.title} interactive>
            <span style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <Icon name={f.icon} size={24} />
            </span>
            <h3 style={{ fontSize: 19, marginBottom: 8 }}>{f.title}</h3>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.body}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function HowItWorks() {
  return (
    <Section style={{ background: 'var(--surface-card)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 64, alignItems: 'center' }}>
        <div>
          <Eyebrow>Como funciona</Eyebrow>
          <h2 style={{ fontSize: 'clamp(30px,4vw,44px)', letterSpacing: '-.03em', lineHeight: 1.1, margin: '20px 0 20px' }}>
            Do pedido à sua porta, com quatro paradas visíveis.
          </h2>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 28 }}>
            Você cadastra a cotação uma vez. A partir daí a Impoclick puxa o status da armadora, calcula o custo e avisa o seu time a cada etapa.
          </p>
          <Button variant="primary" iconRight="arrow_outward">Começar uma cotação</Button>
        </div>
        <Card>
          <Timeline steps={[
            { title: 'Cote com 3 agentes', date: 'dia 0', meta: 'Modal, incoterm e NCM em um formulário', state: 'done', icon: 'request_quote' },
            { title: 'Feche com o fornecedor', date: 'dia 4', meta: 'Documentos anexados ao processo', state: 'done', icon: 'handshake' },
            { title: 'Acompanhe o trajeto', date: 'dia 7–39', meta: 'Posição e ETA atualizadas todo dia', state: 'current', icon: 'directions_boat' },
            { title: 'Receba com o custo fechado', date: 'dia 42', meta: 'Custo desembarcado por item', state: 'todo', icon: 'local_shipping' },
          ]} />
        </Card>
      </div>
    </Section>
  );
}

function Numbers() {
  return (
    <Section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 16 }}>
        {[
          { label: 'Contêineres acompanhados', value: '12.480', delta: '+31%', note: 'em 2026' },
          { label: 'Economia média em armazenagem', prefix: 'R$', value: '14.200', note: 'por processo' },
          { label: 'Dias a menos no desembaraço', value: '3,4', suffix: 'dias' },
          { label: 'Importadores ativos', value: '640', delta: '+18%' },
        ].map(s => (
          <Card key={s.label} variant="flat">
            <Stat {...s} deltaNote={s.note} size="sm" />
          </Card>
        ))}
      </div>
    </Section>
  );
}

function Testimonial() {
  return (
    <Section style={{ paddingTop: 0 }}>
      <Card variant="invert" style={{ padding: 56 }}>
        <div style={{ maxWidth: '46ch' }}>
          <Icon name="format_quote" size={40} style={{ color: 'var(--aqua-400)' }} />
          <p style={{ fontSize: 'clamp(22px,2.6vw,30px)', lineHeight: 1.35, letterSpacing: '-.02em', color: '#fff', fontWeight: 500, margin: '12px 0 28px' }}>
            Antes eu descobria a armazenagem na fatura. Agora eu recebo o aviso sete dias antes e resolvo com o despachante no mesmo dia.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="Camila Prado" size="md" accent />
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Camila Prado</div>
              <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13 }}>Head de Suprimentos · Vertta Eletro</div>
            </div>
          </div>
        </div>
      </Card>
    </Section>
  );
}

function CTA({ onEnter }) {
  return (
    <Section style={{ paddingTop: 0 }}>
      <Card variant="accent" style={{ padding: 56, textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-.03em', lineHeight: 1.1, maxWidth: '20ch', margin: '0 auto' }}>
          Acompanhe o seu próximo contêiner sem custo
        </h2>
        <p style={{ fontSize: 17, margin: '16px auto 28px', maxWidth: '52ch', color: 'color-mix(in oklab, var(--text-on-accent) 78%, transparent)' }}>
          Cadastre um processo em andamento e veja o custo desembarcado em menos de dez minutos.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ flex: '1 1 240px' }}><Input pill placeholder="seu@email.com.br" icon="mail" /></div>
          <Button variant="secondary" size="md" iconRight="arrow_outward" onClick={onEnter}>Começar</Button>
        </div>
      </Card>
    </Section>
  );
}

function SiteFooter() {
  return (
    <footer style={{ background: 'var(--surface-card)', borderTop: '1px solid var(--border-subtle)', padding: '56px 32px 32px' }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) repeat(3,minmax(0,1fr))', gap: 40 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <img src="../../../assets/logo-impoclick.png" alt="" style={{ width: 30, height: 30 }} />
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text-title)' }}>Impoclick</span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: '34ch', lineHeight: 1.5 }}>
            Plataforma brasileira de gestão de importação. Do pedido ao custo desembarcado.
          </p>
        </div>
        {[
          ['Produto', ['Plataforma', 'Rastreio', 'Custos', 'Integrações']],
          ['Empresa', ['Sobre', 'Carreiras', 'Contato']],
          ['Recursos', ['Central de ajuda', 'Guia de NCM', 'Status', 'Privacidade']],
        ].map(([title, links]) => (
          <div key={title}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 14 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {links.map(l => <a key={l} href="#" style={{ fontSize: 14, color: 'var(--text-body)', textDecoration: 'none' }}>{l}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 'var(--container-max)', margin: '40px auto 0', paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
        <span>© 2026 Impoclick Tecnologia Ltda. · CNPJ 00.000.000/0001-00</span>
        <span>São Paulo · Brasil</span>
      </div>
    </footer>
  );
}

Object.assign(window, { Features, HowItWorks, Numbers, Testimonial, CTA, SiteFooter });
