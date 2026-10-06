import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ProjectList } from "./pages/ProjectList";
import { ProjectCreate } from "./pages/ProjectCreate";
import { ProjectDetail } from "./pages/ProjectDetail";
import { StudyList } from "./pages/StudyList";
import { StudyImport } from "./pages/StudyImport";
import { ScreeningPage } from "./pages/ScreeningPage";
import { RobSummaryPage } from "./pages/RobSummaryPage";
import { RobAssessmentPage } from "./pages/RobAssessmentPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ExportPage } from "./pages/ExportPage";
import { PrismaFlowPage } from "./pages/PrismaFlowPage";
import { PdfViewerPage } from "./pages/PdfViewerPage";
import { MetaAnalysisPage } from "./pages/MetaAnalysisPage";
import { GradePage } from "./pages/GradePage";
import { PicoHypothesisPage } from "./pages/PicoHypothesisPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { CodeGraphPage } from "./pages/CodeGraphPage";
import { ReviewGraphPage } from "./pages/ReviewGraphPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/projects/new" element={<ProjectCreate />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/projects/:projectId/pico" element={<PicoHypothesisPage />} />
        <Route path="/projects/:projectId/hypothesis" element={<PicoHypothesisPage />} />
        <Route path="/projects/:projectId/studies" element={<StudyList />} />
        <Route path="/projects/:projectId/studies/new" element={<StudyImport />} />
        <Route path="/projects/:projectId/studies/:studyId/pdf" element={<PdfViewerPage />} />
        <Route path="/projects/:projectId/screening" element={<ScreeningPage />} />
        <Route path="/projects/:projectId/prisma" element={<PrismaFlowPage />} />
        <Route path="/projects/:projectId/rob" element={<RobSummaryPage />} />
        <Route path="/projects/:projectId/rob/:assessmentId" element={<RobAssessmentPage />} />
        <Route path="/projects/:projectId/review" element={<ReviewPage />} />
        <Route path="/projects/:projectId/meta-analysis" element={<MetaAnalysisPage />} />
        <Route path="/projects/:projectId/analysis" element={<AnalysisPage />} />
        <Route path="/projects/:projectId/graph/code" element={<CodeGraphPage />} />
        <Route path="/projects/:projectId/graph/review" element={<ReviewGraphPage />} />
        <Route path="/graph/code" element={<CodeGraphPage />} />
        <Route path="/projects/:projectId/grade" element={<GradePage />} />
        <Route path="/projects/:projectId/export" element={<ExportPage />} />
      </Route>
    </Routes>
  );
}
