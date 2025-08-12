// xml-bundler.js
const fs = require('fs');
const path = require('path');

const INCLUDE_PATTERN = /^(\s*)<Include src="([^"]+)"\s*\/>/;
const COMMENT_PATTERN = /^(\s*)<!-- include ([^ ]+) -->/;

function isXMLBundled(xmlContent) {
  return xmlContent && xmlContent.includes('<!-- include ');
}

function bundleXML(xmlContent, xmlDir, visited = new Set()) {
  if (!xmlContent) return xmlContent;

  const lines = xmlContent.split('\n');
  const result = [];

  for (const line of lines) {
    const match = line.match(INCLUDE_PATTERN);

    if (!match) {
      result.push(line);
      continue;
    }

    const [, indent, srcFile] = match;
    const cleanSrc = srcFile.replace(/\.\.\//g, ''); // безопасность

    if (visited.has(cleanSrc)) {
      console.warn(`⚠️  Circular XML include: ${cleanSrc}`);
      result.push(`${indent}<!-- CIRCULAR: ${cleanSrc} -->`);
      continue;
    }

    const xmlFile = cleanSrc.endsWith('.xml') ? cleanSrc : `${cleanSrc}.xml`;
    const fullPath = path.join(xmlDir, xmlFile);

    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing XML include: ${fullPath}`);
      result.push(`${indent}<!-- MISSING: ${cleanSrc} -->`);
      continue;
    }

    result.push(`${indent}<!-- include ${cleanSrc} -->`);

    try {
      const includeContent = fs.readFileSync(fullPath, 'utf-8');
      const bundled = bundleXML(includeContent, xmlDir, new Set([...visited, cleanSrc]));

      const indented = bundled.split('\n')
        .map(line => line.length > 0 ? `${indent}${line}` : line)
        .join('\n');

      result.push(indented);
    } catch (err) {
      console.error(`❌ Error reading ${fullPath}: ${err.message}`);
      result.push(`${indent}<!-- ERROR: ${cleanSrc} -->`);
    }

    result.push(`${indent}<!-- include ${cleanSrc} -->`);
  }

  return result.join('\n');
}

function unbundleXML(bundledXml) {
  const modules = {};
  const lines = bundledXml.split('\n');
  const stack = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const commentMatch = line.match(COMMENT_PATTERN);

    if (!commentMatch) {
      i++;
      continue;
    }

    const [, indent, moduleName] = commentMatch;

    if (stack.length > 0 && stack[stack.length - 1].name === moduleName && stack[stack.length - 1].indent === indent) {
      // Закрывающий комментарий - извлекаем модуль
      const openTag = stack.pop();
      const moduleLines = lines.slice(openTag.start + 1, i);

      const unindented = moduleLines.map(line =>
        line.startsWith(indent) ? line.slice(indent.length) : line
      );

      modules[moduleName] = unindented.join('\n').trim();

      const replacement = `${indent}<Include src="${moduleName}"/>`;
      lines.splice(openTag.start, i - openTag.start + 1, replacement);
      i = openTag.start + 1;
    } else {
      stack.push({ name: moduleName, indent, start: i });
      i++;
    }
  }

  modules['__root'] = lines.join('\n').trim();
  return modules;
}

function unbundleXMLToFiles(bundledXml, outputDir) {
  const modules = unbundleXML(bundledXml);
  const files = [];

  for (const [moduleName, content] of Object.entries(modules)) {
    if (moduleName === '__root') {
      const mainPath = path.join(outputDir, 'UI.xml');
      fs.writeFileSync(mainPath, content, 'utf-8');
      files.push('UI.xml');
    } else {
      const modulesDir = path.join(outputDir, 'UI');
      fs.mkdirSync(modulesDir, { recursive: true });

      const modulePath = path.join(modulesDir, `${moduleName}.xml`);
      fs.writeFileSync(modulePath, content, 'utf-8');
      files.push(`UI/${moduleName}.xml`);
    }
  }

  return files;
}

module.exports = {
  bundleXML,
  unbundleXML,
  unbundleXMLToFiles,
  isXMLBundled
};