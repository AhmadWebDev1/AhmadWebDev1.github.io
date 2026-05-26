const fs = require('fs');
const path = require('path');

// 1. Helper to parse YAML (simple 1-level and 2-level object parser)
function parseYaml(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  let currentParent = null;

  for (let line of lines) {
    // Strip comments
    let lineWithoutComment = line;
    const hashIndex = line.indexOf('#');
    if (hashIndex !== -1) {
      const beforeHash = line.substring(0, hashIndex);
      const quoteCount = (beforeHash.match(/"/g) || []).length + (beforeHash.match(/'/g) || []).length;
      if (quoteCount % 2 === 0) {
        lineWithoutComment = beforeHash;
      }
    }

    const trimmed = lineWithoutComment.trim();
    if (!trimmed) continue;

    // Check indentation
    const indentMatch = lineWithoutComment.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    if (indent === 0) {
      currentParent = null;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    let val = trimmed.substring(colonIndex + 1).trim();
    const hasQuotes = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));

    // Strip surrounding quotes
    if (hasQuotes) {
      val = val.substring(1, val.length - 1);
    }

    if (val === '' && !hasQuotes) {
      if (indent === 0) {
        currentParent = key;
        result[currentParent] = {};
      } else if (currentParent) {
        result[currentParent][key] = {};
      }
    } else {
      let parsedVal = val;
      if (val.toLowerCase() === 'true') parsedVal = true;
      else if (val.toLowerCase() === 'false') parsedVal = false;
      else if (!isNaN(val) && val !== '') parsedVal = Number(val);

      if (indent > 0 && currentParent) {
        result[currentParent][key] = parsedVal;
      } else {
        result[key] = parsedVal;
      }
    }
  }
  
  // Post-process to convert any empty objects (parsed from empty/null YAML keys) to empty strings
  for (let key in result) {
    if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      if (Object.keys(result[key]).length === 0) {
        result[key] = '';
      } else {
        for (let subKey in result[key]) {
          if (result[key][subKey] && typeof result[key][subKey] === 'object' && !Array.isArray(result[key][subKey])) {
            if (Object.keys(result[key][subKey]).length === 0) {
              result[key][subKey] = '';
            }
          }
        }
      }
    }
  }
  
  return result;
}

// 2. Parse Project markdown files
function parseProjectFile(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const parts = fileContent.split('---');
  if (parts.length < 3) return null;

  const frontmatter = parseYaml(parts[1]);
  const bodyText = parts.slice(2).join('---').trim();

  const longDescription = { en: '', ar: '', de: '' };
  const sections = bodyText.split(/(?=##\s+(?:EN|AR|DE))/i);
  
  for (const section of sections) {
    const trimmedSection = section.trim();
    if (!trimmedSection) continue;
    const match = trimmedSection.match(/^##\s+(EN|AR|DE)\b([\s\S]*)$/i);
    if (match) {
      longDescription[match[1].toLowerCase()] = match[2].trim();
    }
  }

  if (bodyText && !longDescription.en && !longDescription.ar && !longDescription.de) {
    longDescription.en = bodyText;
    longDescription.ar = bodyText;
    longDescription.de = bodyText;
  }

  const tags = frontmatter.tags ? frontmatter.tags.split(',').map(t => t.trim()) : [];
  const images = frontmatter.images ? frontmatter.images.split(',').map(t => t.trim()) : [];

  return {
    id: parseInt(frontmatter.id) || 0,
    category: frontmatter.category || 'frontend',
    title: {
      en: frontmatter.title_en || frontmatter.title || '',
      ar: frontmatter.title_ar || frontmatter.title || '',
      de: frontmatter.title_de || frontmatter.title || ''
    },
    description: {
      en: frontmatter.description_en || frontmatter.description || '',
      ar: frontmatter.description_ar || frontmatter.description || '',
      de: frontmatter.description_de || frontmatter.description || ''
    },
    image: frontmatter.image || '',
    images: images,
    tags: tags,
    demoLink: frontmatter.demoLink || frontmatter.demo_link || '',
    repoLink: frontmatter.repoLink || frontmatter.repo_link || '',
    longDescription: longDescription
  };
}

// 3. Resolve dot path in objects
function resolvePath(obj, pathStr) {
  const parts = pathStr.split('.');
  let current = obj;
  for (let part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

// 4. Safe evaluate conditions
function evalCondition(expr, context) {
  if (expr.includes(' or ')) {
    const parts = expr.split(' or ');
    return parts.some(part => evalCondition(part, context));
  }
  if (expr.includes(' and ')) {
    const parts = expr.split(' and ');
    return parts.every(part => evalCondition(part, context));
  }
  if (!expr.includes('==') && !expr.includes('!=') && !expr.includes('===')) {
    const val = resolvePath(context, expr.trim());
    return !!val;
  }
  const match = expr.match(/^([a-zA-Z0-9._]+)\s*(==|!=)\s*['"]([^'"]*)['"]$/);
  if (match) {
    const pathStr = match[1];
    const op = match[2];
    const strVal = match[3];
    const val = resolvePath(context, pathStr);
    const actual = val !== undefined && val !== null ? val.toString() : '';
    if (op === '==') return actual === strVal;
    if (op === '!=') return actual !== strVal;
  }
  return false;
}

// 5. Find matching endfor tag with nesting support
function findClosingEndfor(text, startIdx) {
  let depth = 1;
  let scanIdx = startIdx;
  
  while (scanIdx < text.length) {
    if (text.startsWith('{% for ', scanIdx) || text.startsWith('{%for ', scanIdx)) {
      depth++;
      scanIdx += 7;
    } else if (text.startsWith('{% endfor %}', scanIdx) || text.startsWith('{%endfor%}', scanIdx)) {
      depth--;
      if (depth === 0) {
        return scanIdx;
      }
      scanIdx += 12;
    } else {
      scanIdx++;
    }
  }
  return -1;
}

// 6. Evaluate conditionals {% if ... %} ... {% endif %}
function evaluateConditionals(text, context) {
  const ifRegex = /\{%\s*if\s+([^%]+)\s*%\}/;
  let match;
  while ((match = ifRegex.exec(text)) !== null) {
    const startIdx = match.index;
    const expression = match[1].trim();

    let depth = 1;
    let endIdx = -1;
    let scanIdx = startIdx + match[0].length;
    let elsifIndexes = [];
    let elseIndex = -1;

    while (scanIdx < text.length) {
      if (text.startsWith('{% if ', scanIdx) || text.startsWith('{%if ', scanIdx)) {
        depth++;
        scanIdx += 5;
      } else if (text.startsWith('{% endif %}', scanIdx) || text.startsWith('{%endif%}', scanIdx)) {
        depth--;
        if (depth === 0) {
          endIdx = scanIdx;
          break;
        }
        scanIdx += 11;
      } else if (depth === 1) {
        if (text.startsWith('{% else %}', scanIdx) || text.startsWith('{%else%}', scanIdx)) {
          elseIndex = scanIdx;
          scanIdx += 10;
        } else {
          const elsifMatch = text.substring(scanIdx).match(/^\{%\s*elsif\s+([^%]+)\s*%\}/);
          if (elsifMatch) {
            elsifIndexes.push({ index: scanIdx, expression: elsifMatch[1].trim(), length: elsifMatch[0].length });
            scanIdx += elsifMatch[0].length;
          } else {
            scanIdx++;
          }
        }
      } else {
        scanIdx++;
      }
    }

    if (endIdx === -1) break;

    const conditionResult = evalCondition(expression, context);
    let contentToUse = '';

    if (conditionResult) {
      const firstBranchEnd = elsifIndexes.length > 0 ? elsifIndexes[0].index : (elseIndex !== -1 ? elseIndex : endIdx);
      contentToUse = text.substring(startIdx + match[0].length, firstBranchEnd);
    } else {
      let branchTaken = false;
      for (let i = 0; i < elsifIndexes.length; i++) {
        const elsif = elsifIndexes[i];
        if (evalCondition(elsif.expression, context)) {
          const branchStart = elsif.index + elsif.length;
          const branchEnd = (i + 1 < elsifIndexes.length) ? elsifIndexes[i+1].index : (elseIndex !== -1 ? elseIndex : endIdx);
          contentToUse = text.substring(branchStart, branchEnd);
          branchTaken = true;
          break;
        }
      }
      if (!branchTaken) {
        if (elseIndex !== -1) {
          contentToUse = text.substring(elseIndex + 10, endIdx);
        } else {
          contentToUse = '';
        }
      }
    }

    text = text.substring(0, startIdx) + contentToUse + text.substring(endIdx + 11);
  }
  return text;
}

// 7. Liquid tag substitution
function renderLiquid(template, context) {
  let rendered = template;

  // Substitute simple variables
  rendered = rendered.replace(/\{\{\s*([a-zA-Z0-9._\s|]+)\s*\}\}/g, (match, pathStr) => {
    const parts = pathStr.split('|');
    const varPath = parts[0].trim();
    const filter = parts[1] ? parts[1].trim() : null;

    let val = resolvePath(context, varPath);
    if (val === undefined || val === null) return '';

    if (filter === 'upcase') {
      val = val.toString().toUpperCase();
    } else if (filter === 'jsonify') {
      val = JSON.stringify(val);
    }
    return val;
  });

  // Handle translations specifically
  rendered = rendered.replace(/\{\{\s*site\.data\.translations\[page\.lang\]\.(\w+)(?:\s*\|\s*default:\s*["']([^"']*)["'])?\s*\}\}/g, (match, key, defaultVal) => {
    const lang = context.page.lang;
    const val = context.translations[lang] ? context.translations[lang][key] : null;
    return val !== undefined && val !== null ? val : (defaultVal || '');
  });

  // Evaluate conditionals
  rendered = evaluateConditionals(rendered, context);

  // Clean up any remaining Liquid assignment blocks
  rendered = rendered.replace(/\{%\s*assign\s+[^%]+\s*%\}/g, '');

  return rendered;
}

// 8. Render Project Loop
function renderProjectsLoop(html, projects, globalContext) {
  const forRegex = /\{%\s*for\s+project\s+in\s+sorted_projects\s*%\}/;
  const match = forRegex.exec(html);
  if (!match) return html;

  const startIdx = match.index;
  const contentStartIdx = startIdx + match[0].length;
  const endIdx = findClosingEndfor(html, contentStartIdx);
  if (endIdx === -1) return html;

  const loopContent = html.substring(contentStartIdx, endIdx);
  let renderedProjects = '';

  for (const project of projects) {
    const localContext = {
      ...globalContext,
      project: {
        id: project.id,
        category: project.category,
        title_en: project.title.en,
        title_ar: project.title.ar,
        title_de: project.title.de,
        description_en: project.description.en,
        description_ar: project.description.ar,
        description_de: project.description.de,
        image: project.image,
        images: project.images.join(', '),
        tags: project.tags.join(', '),
        demoLink: project.demoLink,
        repoLink: project.repoLink,
        content: project.longDescription[globalContext.page.lang] || project.longDescription['de'] || ''
      }
    };

    let itemHtml = loopContent;

    const lang = globalContext.page.lang;
    const p_title = project.title[lang] || project.title['de'] || '';
    const p_desc = project.description[lang] || project.description['de'] || '';

    itemHtml = itemHtml.replace(/\{\{\s*p_title\s*\}\}/g, p_title);
    itemHtml = itemHtml.replace(/\{\{\s*p_desc\s*\}\}/g, p_desc);

    // Tags loop (using flexible regex with space/newline matching)
    const tagsLoopRegex = /\{%\s*assign\s+project_tags\s*=\s*project\.tags\s*\|\s*split:\s*["']([^"']*)["']\s*%\}\s*\{%\s*for\s+tag\s+in\s+project_tags\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/;
    const tagsMatch = tagsLoopRegex.exec(itemHtml);
    if (tagsMatch) {
      const tagTemplate = tagsMatch[2];
      let tagsHtml = '';
      for (const tag of project.tags) {
        tagsHtml += tagTemplate.replace(/\{\{\s*tag\s*\|\s*strip\s*\}\}/g, tag.trim());
      }
      itemHtml = itemHtml.replace(tagsLoopRegex, tagsHtml);
    }

    itemHtml = renderLiquid(itemHtml, localContext);
    renderedProjects += itemHtml;
  }

  const endforMatch = html.substring(endIdx).match(/^\{%\s*endfor\s*%\}/);
  const endforLength = endforMatch ? endforMatch[0].length : 12;
  const fullBlock = html.substring(startIdx, endIdx + endforLength);
  return html.replace(fullBlock, renderedProjects);
}

// 9. Recursive folder copier
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 10. Main Build Function
function build() {
  console.log('Compiling Jekyll portfolio website locally...');
  const siteDir = path.join(__dirname, '_site');

  if (fs.existsSync(siteDir)) {
    fs.rmSync(siteDir, { recursive: true, force: true });
  }
  fs.mkdirSync(siteDir, { recursive: true });

  const siteConfig = parseYaml(fs.readFileSync(path.join(__dirname, '_config.yml'), 'utf8'));
  
  if (siteConfig.instagram_url && siteConfig.instagram_url.trim() !== "") {
    let username = siteConfig.instagram_url.trim();
    if (username.endsWith('/')) {
      username = username.slice(0, -1);
    }
    if (username.includes('instagram.com/')) {
      const parts = username.split('instagram.com/');
      username = parts[parts.length - 1];
    }
    siteConfig.instagram_username = username;
    siteConfig.instagram_url = `https://www.instagram.com/${username}/`;
  }

  const translations = parseYaml(fs.readFileSync(path.join(__dirname, '_data/translations.yml'), 'utf8'));

  const projectsDir = path.join(__dirname, '_projects');
  const projectFiles = fs.readdirSync(projectsDir).filter(f => f.endsWith('.md'));
  const projectsData = [];

  for (let file of projectFiles) {
    const proj = parseProjectFile(path.join(projectsDir, file));
    if (proj) {
      projectsData.push(proj);
    }
  }
  projectsData.sort((a, b) => a.id - b.id);

  const defaultLayout = fs.readFileSync(path.join(__dirname, '_layouts/default.html'), 'utf8');

  function compilePage(lang, outputSubdir = '') {
    const pageContext = {
      site: {
        ...siteConfig,
        data: {
          translations: translations
        }
      },
      page: { lang: lang },
      translations: translations
    };

    let layoutHtml = renderProjectsLoop(defaultLayout, projectsData, pageContext);
    layoutHtml = layoutHtml.replace(/\{\{\s*content\s*\}\}/g, '');

    const compiled = renderLiquid(layoutHtml, pageContext);

    const destDir = path.join(siteDir, outputSubdir);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'index.html'), compiled, 'utf8');
  }

  compilePage('de', '');
  compilePage('ar', 'ar');
  compilePage('en', 'en');

  copyDir(path.join(__dirname, 'assets'), path.join(siteDir, 'assets'));

  console.log('Build completed successfully inside "_site/" directory!');
}

if (process.argv.includes('--watch')) {
  build();
  console.log('Watching for changes in source files...');
  
  const watchPaths = [
    '_config.yml',
    '_data/translations.yml',
    '_layouts/default.html',
    '_projects',
    'assets'
  ];

  let debounceTimer;
  const onChange = (event, filename) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\nChange detected in ${filename || 'source file'}. Rebuilding...`);
      try {
        build();
      } catch (err) {
        console.error('Build error:', err.message);
      }
    }, 200);
  };

  watchPaths.forEach(p => {
    const absPath = path.join(__dirname, p);
    if (fs.existsSync(absPath)) {
      fs.watch(absPath, { recursive: true }, onChange);
    }
  });
} else {
  build();
}
