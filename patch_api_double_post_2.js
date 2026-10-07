const fs = require('fs');
let code = fs.readFileSync('src/lib/api.ts', 'utf8');

code = code.replace(
  '    if (path.includes("/studies") && method === "POST") {\n      const projectId =',
  '// temp replaced'
);

code = code.replace(
  '      const newStudy = {\n        study_id: `study_custom_${Date.now()}`,\n        project_id: "proj_pam_current",\n        title: body.title || "Newly Imported Study",\n        authors: body.authors || "Author et al.",\n        publication_year: Number(body.publication_year) || 2024,\n        journal: body.journal || "Journal of Neurosurgery",\n        doi: body.doi || "",\n        pmid: body.pmid || "",\n        abstract: body.abstract || "",\n        source: body.source || "Manual Entry",\n        study_design: body.study_design || "diagnostic accuracy",\n        screening_status: "pending",\n        screening_stage: "title_abstract",\n        screening_reason: "",\n        extraction_status: "pending",\n        pdf_status: "pending",\n        pdf_path: ""\n      };\n      return newStudy as unknown as T;\n    }',
  ''
);

code = code.replace(
  '// temp replaced',
  '    if (path.includes("/studies") && method === "POST") {\n      const projectId ='
);

fs.writeFileSync('src/lib/api.ts', code);
