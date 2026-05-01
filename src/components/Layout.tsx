/** @jsxImportSource hono/jsx */

export const Layout = ({ children, title }: { children: any; title?: string }) => {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title || 'NewLoteca Node'}</title>
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --page-bg: #f4efe3;
            --panel-bg: rgba(255, 251, 242, 0.82);
            --panel-strong: #fff8ea;
            --text-main: #191511;
            --text-soft: #61584d;
            --stroke: rgba(73, 48, 20, 0.12);
            --accent: #0f8f56;
            --accent-strong: #05653c;
            --accent-soft: rgba(15, 143, 86, 0.14);
            --danger: #c13e29;
            --shadow: 0 18px 60px rgba(68, 44, 14, 0.14);
          }

          html[data-theme="dark"] {
            --page-bg: #16120e;
            --panel-bg: rgba(34, 28, 23, 0.88);
            --panel-strong: #241d17;
            --text-main: #f4eadc;
            --text-soft: #b6a998;
            --stroke: rgba(255, 240, 214, 0.08);
            --accent: #5dd39e;
            --accent-strong: #8ef7be;
            --accent-soft: rgba(93, 211, 158, 0.16);
            --danger: #ff7b63;
            --shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            min-height: 100%;
          }

          body {
            background:
              radial-gradient(circle at top left, rgba(246, 194, 84, 0.18), transparent 30%),
              radial-gradient(circle at top right, rgba(15, 143, 86, 0.16), transparent 24%),
              linear-gradient(180deg, var(--page-bg), color-mix(in srgb, var(--page-bg) 80%, black));
            color: var(--text-main);
            font-family: "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif;
          }

          a {
            color: inherit;
            text-decoration: none;
          }

          button,
          input {
            font: inherit;
          }

          .page {
            width: min(100%, 420px);
            margin: 0 auto;
            padding: 12px 0 28px;
          }

          .hero {
            display: block;
          }

          .panel {
            backdrop-filter: blur(14px);
            background: var(--panel-bg);
            border: 1px solid var(--stroke);
            border-radius: 18px;
            box-shadow: var(--shadow);
          }

          .heroMain {
            padding: 16px;
            text-align: center;
          }

          .eyebrow {
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-size: 0.92rem;
            font-weight: 700;
            color: var(--text-soft);
            margin: 0 0 6px;
          }

          .heroMeta {
            margin-top: 0;
            color: var(--text-soft);
            font-size: 0.88rem;
          }

          .drawnGrid {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 20px;
            justify-content: center;
          }

          .drawnBall,
          .betBall {
            width: 40px;
            height: 40px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.85rem;
          }

          .drawnBall {
            background: linear-gradient(135deg, var(--accent), var(--accent-strong));
            color: #fff;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }

          .navRow {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 16px;
            align-items: center;
          }

          .navButton,
          .primaryButton {
            border-radius: 999px;
            padding: 8px 10px;
            border: 1px solid var(--stroke);
            background: var(--panel-strong);
            font-size: 0.88rem;
            min-width: 52px;
            text-align: center;
          }

          .primaryButton {
            background: var(--accent);
            color: white;
            border-color: transparent;
          }

          .navSpacer {
            min-width: 52px;
          }

          .content {
            margin-top: 18px;
            display: grid;
            gap: 18px;
            grid-template-columns: 1fr;
          }

          .footerStats {
            margin-top: 18px;
            padding: 6px 14px;
          }

          .footerStatsGrid {
            display: grid;
            gap: 0;
            grid-template-columns: 1fr;
          }

          .infoRow {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            padding: 6px 0;
            border-top: 1px solid var(--stroke);
            text-align: left;
            align-items: center;
          }

          .infoRow:first-child {
            border-top: 0;
          }

          .infoLabel {
            color: var(--text-soft);
            font-size: 0.74rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .infoValue {
            font-size: 0.86rem;
            font-weight: 600;
          }

          .section {
            padding: 16px;
            text-align: center;
          }

          .sectionTitle {
            margin: 0 0 14px;
            font-size: 1rem;
          }

          .betsList {
            display: grid;
            gap: 10px;
          }

          .betRow {
            display: flex;
            justify-content: center;
            gap: 10px;
            padding: 4px 0;
            border-radius: 0;
            background: transparent;
            border: 0;
            border-top: 1px solid var(--stroke);
            flex-wrap: wrap;
          }

          .betBall {
            width: 32px;
            height: 32px;
            background: color-mix(in srgb, var(--panel-strong) 60%, var(--text-main) 10%);
            font-size: 0.78rem;
          }

          .betBallHit {
            background: linear-gradient(135deg, var(--accent), var(--accent-strong));
            color: #fff;
            border: 0;
          }

          .prizeTable,
          .footerStatsGrid {
            width: 100%;
          }

          .prizeTable {
            border-collapse: collapse;
          }

          .prizeTable td {
            padding: 8px 0;
            border-top: 1px solid var(--stroke);
            font-size: 0.88rem;
            text-align: center;
          }

          .errorBox {
            padding: 24px;
            color: white;
            background: linear-gradient(135deg, var(--danger), #7f2013);
          }

          @media (max-width: 920px) {
            .betRow {
              justify-content: center;
            }
          }

          @media (max-width: 360px) {
            .infoRow {
              flex-direction: column;
              gap: 2px;
              text-align: center;
            }
          }
        ` }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
