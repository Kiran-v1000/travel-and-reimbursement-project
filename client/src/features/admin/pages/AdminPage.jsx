import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader, Tabs } from '../../../shared/components/ui/primitives.jsx';
import { RulesTab } from '../components/RulesTab.jsx';
import { PeopleTab } from '../components/PeopleTab.jsx';
import { PolicyTab } from '../components/PolicyTab.jsx';
import { OrgTab } from '../components/OrgTab.jsx';

const TABS = [
  { value: 'rules', label: 'Approval routing', Comp: RulesTab },
  { value: 'people', label: 'People', Comp: PeopleTab },
  { value: 'policy', label: 'Policy & categories', Comp: PolicyTab },
  { value: 'org', label: 'Organisation & currencies', Comp: OrgTab },
];

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'rules';
  const Comp = TABS.find((t) => t.value === tab)?.Comp ?? RulesTab;
  return (
    <div>
      <PageHeader kicker="Administration" title="Configure Voyage" description="Routing, people, policy limits and reference data. Every change is versioned and audited." />
      <Tabs id="admin-tabs" className="mb-6" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          <Comp />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
