const fs = require('fs');
let code = fs.readFileSync('src/lib/api.ts', 'utf8');

// There are two "if (path.includes("/studies") && method === "POST") {" blocks. We need to remove the old one.
const oldPostStart = `      const newStudy = {
        study_id: \`study_custom_\${Date.now()}\`,
        project_id: "proj_pam_current",
        title: body.title || "Newly Imported Study",
        authors: body.authors || "Author et al.",
        publication_year: Number(body.publication_year) || 2024,
        journal: body.journal || "Journal of Neurosurgery",
        doi: body.doi || "",
        pmid: body.pmid || "",
        abstract: body.abstract || "",
        source: body.source || "Manual Entry",
        study_design: body.study_design || "diagnostic accuracy",
        screening_status: "pending",
        screening_stage: "title_abstract",
        screening_reason: "",
        extraction_status: "pending",
        pdf_status: "pending",
        pdf_path: ""
      };
      return newStudy as unknown as T;`;

code = code.replace(oldPostStart, '');
fs.writeFileSync('src/lib/api.ts', code);
