import { Navigate, Route, Routes } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import AgentsPage from './pages/AgentsPage.jsx';
import NewAgentPage from './pages/NewAgentPage.jsx';
import RunDetailPage from './pages/RunDetailPage.jsx';
import RunsPage from './pages/RunsPage.jsx';
import AutomationsPage from './pages/AutomationsPage.jsx';
import AutomationEditorPage from './pages/AutomationEditorPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/agents" replace />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="new" element={<NewAgentPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:runId" element={<RunDetailPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="automations/new" element={<AutomationEditorPage />} />
        <Route path="automations/:automationId" element={<AutomationEditorPage />} />
        <Route path="*" element={<Navigate to="/agents" replace />} />
      </Route>
    </Routes>
  );
}
