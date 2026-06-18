/**
 * Admin panel — multi-agent system status.
 */
import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Stack, Typography, Chip, LinearProgress } from '@mui/material';
import { apiService, AgentStatus } from '../../services/api';

const dot = (status: string) => ({
  width: 10, height: 10, borderRadius: '50%',
  background: status === 'active' ? '#22C55E' : status === 'processing' ? '#F59E0B' : status === 'error' ? '#EF4444' : '#71717A',
  boxShadow: status === 'active' ? '0 0 10px #22C55E' : 'none',
});

export const AgentMonitor: React.FC = () => {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => apiService.getAgents().then(setAgents).catch(() => {}).finally(() => setLoading(false));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2.5 }}>
        {agents.map((a) => (
          <Card key={a.id}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={dot(a.status)} />
                <Typography variant="h6" sx={{ flex: 1, fontSize: '1rem' }}>{a.name}</Typography>
                <Chip size="small" variant="outlined" label={a.status} />
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{a.tasksCompleted.toLocaleString()}</Typography>
              <Typography variant="body2">tasks completed</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default AgentMonitor;
