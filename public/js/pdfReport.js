function buildAndDownloadReport(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 15;

  doc.setFontSize(16);
  doc.text('Troubleshooting Skills Training — Report', 10, y); y += 10;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 10, y); y += 8;

  doc.setFontSize(12);
  doc.text(`Participant: ${data.participantName} (${data.participantEmail})`, 10, y); y += 7;
  doc.text(`Problem: ${data.problemTitle}`, 10, y); y += 7;
  doc.text(`OSI Layer (actual fault): ${data.osiLayer}`, 10, y); y += 10;

  doc.setFontSize(13);
  doc.text('Summary', 10, y); y += 7;
  doc.setFontSize(11);
  doc.text(`Final CSAT Average: ${data.finalCsatAvg} / 10`, 10, y); y += 6;
  doc.text(`Question Credit Remaining: ${data.creditRemaining} / ${data.creditStart}`, 10, y); y += 6;
  doc.text(`Turns Used: ${data.turnsUsed} / ${data.questionLimit}`, 10, y); y += 6;
  doc.text(`Root Cause Identified: ${data.rootCauseIdentified ? 'Yes' : 'No'}`, 10, y); y += 6;

  let groundingLabel = 'N/A';
  if (data.finalActEvidenceGrounded === true) groundingLabel = 'Yes — supported by gathered evidence';
  else if (data.finalActEvidenceGrounded === false) groundingLabel = 'No — correct but not clearly evidence-supported (guess/intuition)';
  doc.text(`Final Solution Evidence-Grounded: ${groundingLabel}`, 10, y); y += 6;

  doc.text(`Diagnostic Evidence: ${data.evidenceDestroyed ? 'Potentially Destroyed (blind action taken)' : 'Preserved'}`, 10, y); y += 10;

  doc.setFontSize(13);
  doc.text('Turn-by-Turn Log', 10, y); y += 4;

  const rows = data.logs.map(l => {
    const groundedTag = l.phase === 'act' ? (l.evidence_grounded === true ? ' [Grounded]' : l.evidence_grounded === false ? ' [Not Grounded]' : '') : '';
    return [l.turn_number, l.phase + groundedTag, l.question_text, l.csat_score, l.credit_delta, l.ai_feedback];
  });
  doc.autoTable({
    startY: y,
    head: [['Turn', 'Phase', 'Question/Action', 'CSAT', 'Credit Δ', 'Feedback']],
    body: rows,
    styles: { fontSize: 8 },
    columnStyles: { 2: { cellWidth: 42 }, 5: { cellWidth: 53 } }
  });

  let finalY = doc.lastAutoTable.finalY + 10;
  if (finalY > 260) { doc.addPage(); finalY = 15; }

  doc.setFontSize(13);
  doc.text('Framework-Aligned Suggestions', 10, finalY); finalY += 7;
  doc.setFontSize(10);
  data.suggestions.forEach(s => {
    const lines = doc.splitTextToSize(`• ${s}`, 190);
    doc.text(lines, 10, finalY);
    finalY += lines.length * 5 + 3;
    if (finalY > 280) { doc.addPage(); finalY = 15; }
  });

  const safeName = (data.participantName || 'participant').replace(/\s+/g, '_');
  const safeProblem = (data.problemTitle || 'exercise').replace(/\s+/g, '_');
  doc.save(`Report_${safeName}_${safeProblem}.pdf`);
}

async function fetchAndDownloadReport(sessionId, accessToken) {
  const res = await fetch(`/api/getReport?sessionId=${sessionId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (data.error) { alert('Error generating report: ' + data.error); return; }
  buildAndDownloadReport(data);
}
