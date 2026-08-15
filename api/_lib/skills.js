import fs from 'fs';
import path from 'path';

function loadSkill(filename) {
  const filePath = path.join(process.cwd(), 'skills', filename);
  return fs.readFileSync(filePath, 'utf8');
}

export function loadSkills() {
  return {
    simulator: loadSkill('simulator-agent.md'),
    judge: loadSkill('judge-agent.md')
  };
}
