/**
 * VeriChainX landing page — modern dark SaaS.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Stack, Typography, Button, Chip, Card, CardContent, Divider, Link as MuiLink,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import HubIcon from '@mui/icons-material/Hub';
import BoltIcon from '@mui/icons-material/Bolt';
import InsightsIcon from '@mui/icons-material/Insights';
import TokenIcon from '@mui/icons-material/Token';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { apiService, SystemMetrics, HederaNetwork } from '../services/api';
import { VIOLET, CYAN } from '../theme';

const features = [
  { icon: <InsightsIcon />, title: 'AI authenticity scoring', body: 'LLM + vector-embedding analysis scores every product and flags counterfeits in real time.' },
  { icon: <AccountTreeIcon />, title: 'Multi-agent system', body: 'Orchestrated agents (analyzer, rules, Hedera, notifier) coordinate detection and enforcement.' },
  { icon: <HubIcon />, title: 'Hedera consensus anchoring', body: 'Verdicts are anchored to the Hedera Consensus Service — immutable, timestamped, verifiable.' },
  { icon: <TokenIcon />, title: 'Authenticity NFTs', body: 'Mint Hedera Token Service certificates that travel with a product across its lifecycle.' },
  { icon: <BoltIcon />, title: 'TiDB HTAP backend', body: 'Vector search + analytics on a single distributed SQL engine — fast at any scale.' },
  { icon: <VerifiedUserIcon />, title: 'On-chain proof', body: 'Every record links to HashScan so anyone can independently verify it on the network.' },
];

const Nav = () => (
  <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,15,0.6)' }}>
    <Container maxWidth="lg">
      <Stack direction="row" alignItems="center" spacing={2} sx={{ height: 64 }}>
        <Stack direction="row" alignItems="center" spacing={1.2} sx={{ flex: 1 }}>
          <Box sx={{ width: 28, height: 28, borderRadius: '8px', background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16 }}>◆</Box>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>VeriChainX</Typography>
        </Stack>
        <MuiLink href="#features" underline="none" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>Features</MuiLink>
        <MuiLink href="https://github.com/ZubeidHendricks/verichainX-hedera" target="_blank" underline="none" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>Docs</MuiLink>
        <Button component={RouterLink} to="/admin" variant="contained" endIcon={<ArrowForwardIcon />}>Launch app</Button>
      </Stack>
    </Container>
  </Box>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Card sx={{ flex: 1, minWidth: 150 }}>
    <CardContent>
      <Typography variant="h4" sx={{ background: `linear-gradient(135deg, #fff, ${CYAN})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800 }}>{value}</Typography>
      <Typography variant="body2">{label}</Typography>
    </CardContent>
  </Card>
);

export const LandingPage: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [net, setNet] = useState<HederaNetwork | null>(null);

  useEffect(() => {
    apiService.getSystemMetrics().then(setMetrics).catch(() => {});
    apiService.getHederaNetwork().then(setNet).catch(() => {});
  }, []);

  return (
    <Box>
      <Nav />

      {/* Hero */}
      <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 14 }, pb: 8 }}>
        <Stack spacing={4} alignItems="flex-start" sx={{ maxWidth: 820 }}>
          <Chip label="AI + Hedera Hashgraph" variant="outlined" sx={{ color: CYAN, borderColor: 'rgba(34,211,238,0.4)' }} />
          <Typography variant="h1">
            Detect counterfeits.{' '}
            <Box component="span" sx={{ background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Verify on-chain.
            </Box>
          </Typography>
          <Typography variant="body1" sx={{ fontSize: '1.2rem', maxWidth: 640 }}>
            VeriChainX combines multi-agent AI with the Hedera network to detect, verify, and immutably
            anchor product authenticity across global supply chains.
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Button component={RouterLink} to="/admin" size="large" variant="contained" endIcon={<ArrowForwardIcon />}>Launch dashboard</Button>
            <Button href="#features" size="large" variant="outlined">Explore features</Button>
          </Stack>
        </Stack>

        {/* Live stats */}
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 7 }}>
          <Stat label="Products scanned" value={metrics ? metrics.totalScanned.toLocaleString() : '—'} />
          <Stat label="Detection accuracy" value={metrics ? `${metrics.accuracyRate}%` : '—'} />
          <Stat label="Counterfeits flagged" value={metrics ? metrics.counterfeitsDetected.toLocaleString() : '—'} />
          <Stat label="Hedera nodes (live)" value={net && net.consensusNodes ? String(net.consensusNodes) : '—'} />
        </Stack>
      </Container>

      {/* Features */}
      <Box id="features" sx={{ py: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Container maxWidth="lg">
          <Stack spacing={1.5} sx={{ mb: 6 }}>
            <Typography variant="overline" color="primary">WHAT IT DOES</Typography>
            <Typography variant="h2">One platform, end-to-end authenticity</Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2.5 }}>
            {features.map((f) => (
              <Card key={f.title} sx={{ height: '100%', transition: '0.2s', '&:hover': { borderColor: 'rgba(124,92,255,0.5)', transform: 'translateY(-3px)' } }}>
                <CardContent>
                  <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'grid', placeItems: 'center', mb: 2, color: VIOLET, background: 'rgba(124,92,255,0.12)' }}>{f.icon}</Box>
                  <Typography variant="h6" sx={{ mb: 1 }}>{f.title}</Typography>
                  <Typography variant="body2">{f.body}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Card sx={{ p: { xs: 4, md: 8 }, textAlign: 'center', background: `linear-gradient(135deg, ${'rgba(124,92,255,0.14)'}, ${'rgba(34,211,238,0.08)'})` }}>
          <Typography variant="h2" sx={{ mb: 2 }}>See it run on real Hedera testnet data</Typography>
          <Typography variant="body1" sx={{ mb: 4, maxWidth: 560, mx: 'auto' }}>
            Open the operations dashboard to analyze products, monitor agents, and watch live on-chain activity.
          </Typography>
          <Button component={RouterLink} to="/admin" size="large" variant="contained" endIcon={<ArrowForwardIcon />}>Open dashboard</Button>
        </Card>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ borderTop: '1px solid rgba(255,255,255,0.07)', py: 4 }}>
        <Container maxWidth="lg">
          <Divider sx={{ mb: 3, opacity: 0 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
            <Typography variant="body2">© {new Date().getFullYear()} VeriChainX · Built on Hedera + TiDB</Typography>
            <Stack direction="row" spacing={3}>
              <MuiLink component={RouterLink} to="/admin" underline="hover" color="text.secondary">Dashboard</MuiLink>
              <MuiLink href="https://github.com/ZubeidHendricks/verichainX-hedera" target="_blank" underline="hover" color="text.secondary">GitHub</MuiLink>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage;
