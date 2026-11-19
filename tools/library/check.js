// بررسیِ «هیچ ورودی/خروجیِ بی‌هدف»: node tools/library/check.js library/x.pm.json ...
global.window = global;
require('../../assets/jalali.js'); require('../../assets/engine.js');
const fs = require('fs'); let bad = 0;
process.argv.slice(2).forEach(f => {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const P = { project: { start_date: null }, milestones: [], logs: [], files: [],
    nodes: j.nodes.map(n => ({ id: n.id, parent_id: n.parent, kind: n.kind, title: n.title, inputs: n.inputs || [], outputs: n.outputs || [], flow: n.flow, process: n.process || '', details: n.details || '', status: 'todo', progress: 0, sort: n.order })),
    deps: j.dependencies.map((d, i) => ({ id: i + 1, from_id: d.from, to_id: d.to, out_name: d.out || null, in_name: d.in || null, bnd: d.bnd || null, two: d.two ? 1 : 0, label: d.label })) };
  const idx = ENG.build(P), iss = ENG.portIssues(idx);
  // کار: دقیقاً یک ورودی/خروجی
  const tasks = P.nodes.filter(n => n.kind === 'task' && (n.inputs.length !== 1 || n.outputs.length !== 1));
  const noDesc = P.nodes.filter(n => (n.kind === 'module' || n.kind === 'task') && !(n.details || n.process));
  console.log((iss.length || tasks.length ? '✗ ' : '✓ ') + f.split('/').pop() + '  گره‌ها=' + P.nodes.length + ' بی‌هدف=' + iss.length + (tasks.length ? ' کارِ غیرتک‌ورودی=' + tasks.length : '') + (noDesc.length ? ' بدونِ‌توضیح=' + noDesc.length : ''));
  iss.slice(0, 6).forEach(i => console.log('    -', i.path, i.ports.map(p => p.side + ':' + p.name + '(' + p.state + ')').join(', ')));
  bad += iss.length + tasks.length;
});
process.exit(bad ? 1 : 0);
