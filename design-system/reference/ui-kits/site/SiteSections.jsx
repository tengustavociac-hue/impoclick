const { Button, IconButton, Badge, Card, Stat, Icon, Input, SegmentedControl, Timeline, Tag, Avatar } = window.ImpoclickDesignSystem_ec37fd;

function Eyebrow({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', borderRadius: 'var(--radius-pill)', background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-border)', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />{children}
    </span>
  );
}

function Section({ children, style }) {
  return <section style={{ padding: '96px 32px', ...style }}><div style={{ maxWidth: 'var(--container-max)', margin: '0 auto' }}>{children}</div></section>;
}

function SiteHeader({ onEnter }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--veil-light)', backdropFilter: 'var(--blur-bar)', WebkitBackdropFilter: 'var(--blur-bar)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ maxWidth: 'var(--container-wide)', margin: '0 auto', height: 72, padding: '0 32px', display: 'flex', alignItems: 'center', gap: 32 }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="../../../assets/logo-impoclick.png" alt="" style={{ width: 34, height: 34 }} />
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text-title)' }}>Impoclick</span>
        </a>
        <nav style={{ display: 'flex', gap: 26, marginLeft: 20 }}>
          {['Plataforma', 'Como funciona', 'Preços', 'Casos'].map(l => (
            <a key={l} href="#" style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-body)', textDecoration: 'none' }}>{l}</a>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="ghost" size="sm">Entrar</Button>
          <Button variant="primary" size="sm" iconRight="arrow_outward" onClick={onEnter}>Abrir demonstração</Button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onEnter }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface-card)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ position: 'absolute', top: -220, right: -120, width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in oklab, var(--aqua-400) 26%, transparent) 0%, transparent 68%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -280, left: -160, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in oklab, var(--orange-400) 14%, transparent) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: 'var(--container-max)', margin: '0 auto', padding: '104px 32px 0', textAlign: 'center' }}>
        <Eyebrow>Importação da China, ponta a ponta</Eyebrow>
        <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 1.03, letterSpacing: '-.035em', fontWeight: 600, margin: '24px auto 0', maxWidth: 16 + 'ch' }}>
          Todo o seu processo de importação <span style={{ color: 'var(--accent)' }}>em um clique</span>
        </h1>
        <p style={{ fontSize: 19, color: 'var(--text-muted)', maxWidth: '58ch', margin: '22px auto 0', lineHeight: 1.5 }}>
          Cotação, fornecedor, embarque, desembaraço e custo desembarcado no mesmo painel. Você vê onde a carga está e quanto ela custa — antes de ela chegar.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '32px 0 12px', flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" iconRight="arrow_outward" onClick={onEnter}>Abrir demonstração</Button>
          <Button variant="outline" size="lg" iconLeft="play_circle">Ver em 2 minutos</Button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sem cartão. Primeiro contêiner acompanhado grátis.</p>

        <div style={{ marginTop: 56, borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', background: 'var(--surface-page)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', textAlign: 'left' }}>
          <div style={{ height: 44, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: 'var(--surface-card)' }}>
            {['var(--ink-300)', 'var(--ink-300)', 'var(--ink-300)'].map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            <span className="ic-mono" style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>app.impoclick.com.br/painel</span>
          </div>
          <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <Card variant="accent" eyebrow="Valor em trânsito" compact>
              <Stat prefix="US$" value="1.284.600" fraction=",00" delta="+12,4%" deltaNote="vs. mês anterior" size="sm" />
            </Card>
            <Card eyebrow="IMP-2481" title="Shenzhen → Santos" compact>
              <Timeline steps={[
                { title: 'Embarcado', date: '07 abr', state: 'done', icon: 'directions_boat' },
                { title: 'Em trânsito', date: 'prev. 29 abr', state: 'current', icon: 'public' },
                { title: 'Desembaraço', state: 'todo', icon: 'gavel' },
              ]} />
            </Card>
            <Card eyebrow="Status da frota" compact>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <Badge tone="accent" dot>12 em trânsito</Badge>
                <Badge tone="warning" dot>4 aguardando DI</Badge>
                <Badge tone="success" dot>2 entregues esta semana</Badge>
                <Badge tone="danger" dot>1 retido</Badge>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-card)' }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Operando com</span>
        {['MSC', 'Maersk', 'COSCO', 'Hapag-Lloyd', 'CMA CGM', 'Receita Federal'].map(n => (
          <span key={n} style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--ink-400)' }}>{n}</span>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Eyebrow, Section, SiteHeader, Hero, LogoStrip });
