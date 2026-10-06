import { jsPDF } from 'jspdf'

const SEISMIC_LABEL = { 1: '耐震等級1', 2: '耐震等級2', 3: '耐震等級3' }
const FIRE_LABEL = { '1hr': '耐火1時間', '2hr': '耐火2時間', 'non-rated': '非耐火' }
const ROLE_LABEL = { primary: '主構造', secondary: '二次構造', 'non-structural': '非構造' }

function today() {
  return new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function generatePDF(parts, selectedVariants, visible, projectSettings, formatCurrency) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const MARGIN = 14
  const COL = W - MARGIN * 2

  function getVariant(part) {
    const idx = selectedVariants[part.id] ?? 0
    return part.variants[idx]
  }

  // ── Cover page ──────────────────────────────────────────────
  doc.setFillColor(44, 62, 80)
  doc.rect(0, 0, W, 60, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('施工要領書', MARGIN, 22)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Assembly Method Statement', MARGIN, 30)

  doc.setFontSize(10)
  doc.text(`Project: ${projectSettings.name ?? 'IC Kit'}`, MARGIN, 44)
  doc.text(`Date: ${today()}`, MARGIN, 50)
  doc.text(`Standard: ${projectSettings.standard === 'JP' ? 'Japan (建築基準法)' : 'UK (RIBA)'}`, MARGIN, 56)

  doc.setTextColor(0, 0, 0)

  // ── Summary table ──
  let y = 70
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Assembly Summary', MARGIN, y)
  y += 6

  const activeParts = parts.filter(p => visible[p.id])
  const totalWeight = activeParts.reduce((s, p) => s + getVariant(p).weight_kg, 0)
  const totalCost   = activeParts.reduce((s, p) => s + getVariant(p).unit_cost_usd + (getVariant(p).labor_cost_usd ?? 0), 0)
  const totalCarbon = activeParts.reduce((s, p) => s + getVariant(p).carbon_kgco2e, 0)
  const totalTime   = activeParts.reduce((s, p) => s + (getVariant(p).assembly_time_min ?? 0), 0)

  const summaryRows = [
    ['Total Components', `${activeParts.length} (of ${parts.length})`],
    ['Total Weight', `${totalWeight.toLocaleString()} kg`],
    ['All-in Cost', formatCurrency(totalCost)],
    ['Embodied CO\u2082e', `${totalCarbon.toLocaleString()} kg`],
    ['Total Install Time', `${totalTime} min (~${Math.ceil(totalTime / 60)} hrs)`],
    ['Factory Work Ratio', `${activeParts.filter(p => p.factory_work).length}/${activeParts.length} parts prefabricated`],
  ]

  doc.setFontSize(9)
  summaryRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(val, MARGIN + 60, y)
    y += 5.5
  })

  // ── Parts pages ──────────────────────────────────────────────
  parts.forEach((part, idx) => {
    doc.addPage()
    const v = getVariant(part)
    let py = MARGIN

    // Part header bar
    const [r, g, b] = hexToRgb(v.color)
    doc.setFillColor(r, g, b)
    doc.rect(0, 0, W, 14, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(`${String(part.sequence).padStart(2, '0')}. ${part.id}`, MARGIN, 9)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${part.factory_work ? '[Factory]' : '[Site]'} · Seq #${part.sequence} · ${part.structural_role ? ROLE_LABEL[part.structural_role] ?? '' : ''}`,
      MARGIN + 80, 9
    )
    doc.setTextColor(0, 0, 0)
    py = 22

    // Variant label
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Active Variant:', MARGIN, py)
    doc.setFont('helvetica', 'normal')
    doc.text(v.label, MARGIN + 35, py)
    py += 5

    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(v.meta, MARGIN, py)
    doc.setTextColor(0, 0, 0)
    py += 8

    // ─ Stats table ─
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Component Data', MARGIN, py)
    py += 4

    const stats = [
      ['Weight', `${v.weight_kg.toLocaleString()} kg`],
      ['Dimensions', `${(part.size[0]*1000).toFixed(0)} × ${(part.size[1]*1000).toFixed(0)} × ${(part.size[2]*1000).toFixed(0)} mm (W×H×D)`],
      ['Material Cost', formatCurrency(v.unit_cost_usd)],
      ...(v.labor_cost_usd != null ? [['Labour Cost', formatCurrency(v.labor_cost_usd)]] : []),
      ['CO\u2082e', `${v.carbon_kgco2e.toLocaleString()} kg`],
      ...(v.assembly_time_min != null ? [['Install Time', `${v.assembly_time_min} min`]] : []),
      ...(v.lead_time_days != null ? [['Lead Time', `${v.lead_time_days} days`]] : []),
    ]

    doc.setFontSize(9)
    drawTable(doc, stats, MARGIN, py, COL)
    py += stats.length * 6 + 4

    // ─ Structural data ─
    const hasStructural = v.seismic_grade || v.fire_resistance_grade || v.load_bearing_kn
    if (hasStructural) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Structural / 構造性能', MARGIN, py)
      py += 4

      const structRows = [
        ...(v.seismic_grade != null ? [['耐震等級', SEISMIC_LABEL[v.seismic_grade]]] : []),
        ...(v.fire_resistance_grade ? [['耐火等級', FIRE_LABEL[v.fire_resistance_grade] ?? v.fire_resistance_grade]] : []),
        ...(v.load_bearing_kn != null ? [['耐荷重', `${v.load_bearing_kn.toLocaleString()} kN`]] : []),
        ...(v.bsl_compliant ? [['建築基準法', v.bsl_notes ?? '適合']] : []),
      ]
      doc.setFontSize(9)
      drawTable(doc, structRows, MARGIN, py, COL)
      py += structRows.length * 6 + 4
    }

    // ─ JIS standards ─
    if (v.jis_standards?.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('JIS規格', MARGIN, py)
      py += 4
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(v.jis_standards.join('  ·  '), MARGIN + 2, py)
      py += 8
    }

    // ─ Connections ─
    const connections = part.connections ?? []
    if (connections.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Connections / 接合部', MARGIN, py)
      py += 4

      const connRows = connections.map(c => [
        `${c.type} → ${c.to}`,
        c.hardware ?? '—'
      ])
      doc.setFontSize(9)
      drawTable(doc, connRows, MARGIN, py, COL)
      py += connRows.length * 6 + 4
    }

    // ─ Install notes ─
    if (v.dfma_notes) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('施工要領 / Install Notes', MARGIN, py)
      py += 4

      doc.setFillColor(248, 248, 248)
      const noteLines = doc.splitTextToSize(v.dfma_notes, COL - 6)
      const noteH = noteLines.length * 5 + 6
      doc.rect(MARGIN, py - 3, COL, noteH, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(noteLines, MARGIN + 3, py + 1)
      py += noteH + 4
    }

    // ─ Supplier ─
    if (v.supplier) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Supplier / メーカー', MARGIN, py)
      py += 4
      doc.setFontSize(9)
      drawTable(doc, [
        ['Supplier', v.supplier],
        ...(v.sku ? [['SKU', v.sku]] : []),
      ], MARGIN, py, COL)
    }

    // Page footer
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Genba Lab  ·  施工要領書  ·  ${today()}  ·  Part ${idx + 1}/${parts.length}`, MARGIN, 290)
    doc.setTextColor(0, 0, 0)
  })

  doc.save(`施工要領書_${projectSettings.name ?? 'IC-Kit'}_${today().replace(/\//g, '-')}.pdf`)
}

function drawTable(doc, rows, x, y, width) {
  const colW = width / 2
  rows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(String(label), x + 2, y)
    doc.setFont('helvetica', 'normal')
    const valLines = doc.splitTextToSize(String(val ?? '—'), colW - 4)
    doc.text(valLines, x + colW, y)
    doc.setDrawColor(220, 220, 220)
    doc.line(x, y + 1.5, x + width, y + 1.5)
    y += 6
  })
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]
}
