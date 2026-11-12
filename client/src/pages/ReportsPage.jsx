import { BarChart3, Clock3, TrendingUp } from 'lucide-react';

export default function ReportsPage() {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">INSIGHTS</span><h1>Reports</h1><p>Performance reporting is being expanded with team-level conversion and campaign analytics.</p></div>
        <div className="metric-icon blue"><BarChart3 size={20} /></div>
      </div>
      <section className="panel report-placeholder">
        <TrendingUp size={24} />
        <h2>Reporting foundation is ready</h2>
        <p>Lead counts and call activity are available on the overview dashboard. Agent-level reports, date filters and CSV exports are planned next.</p>
        <span><Clock3 size={15} /> More reporting modules coming next</span>
      </section>
    </>
  );
}
