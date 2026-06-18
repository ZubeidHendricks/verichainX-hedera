/**
 * VeriChainX operations dashboard.
 */
import React, { useState } from 'react';
import {
  Box, Container, Stack, Typography, Tabs, Tab, Button, Chip,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ScienceIcon from '@mui/icons-material/Science';
import TableChartIcon from '@mui/icons-material/TableChart';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import HubIcon from '@mui/icons-material/Hub';
import { ProductAnalysis } from '../components/admin/ProductAnalysis';
import { ResultsTable } from '../components/admin/ResultsTable';
import { AgentMonitor } from '../components/admin/AgentMonitor';
import { HederaPanel } from '../components/admin/HederaPanel';
import { VIOLET, CYAN } from '../theme';

const tabs = [
  { label: 'Analyze', icon: <ScienceIcon />, el: <ProductAnalysis /> },
  { label: 'Results', icon: <TableChartIcon />, el: <ResultsTable /> },
  { label: 'Agents', icon: <AccountTreeIcon />, el: <AgentMonitor /> },
  { label: 'Hedera', icon: <HubIcon />, el: <HederaPanel /> },
];

export const AdminPage: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,15,0.6)' }}>
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" spacing={2} sx={{ height: 64 }}>
            <Stack direction="row" alignItems="center" spacing={1.2} sx={{ flex: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '8px', background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`, display: 'grid', placeItems: 'center', fontWeight: 800 }}>◆</Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>VeriChainX</Typography>
              <Chip size="small" label="Dashboard" variant="outlined" sx={{ ml: 1 }} />
            </Stack>
            <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} variant="outlined" size="small">Back to site</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Typography variant="h3">Operations</Typography>
          <Typography variant="body1">Analyze products, monitor agents, and watch live on-chain activity.</Typography>
        </Stack>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 3, borderBottom: '1px solid rgba(255,255,255,0.08)', '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 48 } }}
        >
          {tabs.map((t) => <Tab key={t.label} icon={t.icon} iconPosition="start" label={t.label} />)}
        </Tabs>

        <Box>{tabs[tab].el}</Box>
      </Container>
    </Box>
  );
};

export default AdminPage;
