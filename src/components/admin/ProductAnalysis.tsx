/**
 * Admin panel — submit a product for AI authenticity analysis.
 * After a verdict: link + QR to the public record, and one-click HCS anchoring.
 */
import React, { useState } from 'react';
import {
  Box, Card, CardContent, Stack, Typography, TextField, Button, Chip, LinearProgress, Alert, Divider,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import VerifiedIcon from '@mui/icons-material/Verified';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import LaunchIcon from '@mui/icons-material/Launch';
import AnchorIcon from '@mui/icons-material/Anchor';
import { QRCodeSVG } from 'qrcode.react';
import { apiService, AnchorResult } from '../../services/api';

export const ProductAnalysis: React.FC = () => {
  const [form, setForm] = useState({ product_name: '', description: '', price: '', category: 'Electronics' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchor, setAnchor] = useState<AnchorResult | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setError(null); setResult(null); setAnchor(null); setLoading(true);
    try {
      const res = await apiService.analyzeProduct({
        product_name: form.product_name || 'Sample Product',
        description: form.description || 'No description provided',
        price: parseFloat(form.price) || 0,
        category: form.category,
      });
      if (!res || typeof res !== 'object') throw new Error('Unexpected response');
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Analysis failed. Check that the API and TiDB credentials are configured.');
    } finally {
      setLoading(false);
    }
  };

  const score = result ? Math.round((result.authenticity_score ?? 0) * 100) : 0;
  const counterfeit = !!result?.is_counterfeit;
  const verifyPath = result?.product_id ? `/verify/${result.product_id}` : null;
  const verifyUrl = verifyPath ? `${window.location.origin}${verifyPath}` : '';

  const anchorVerdict = async () => {
    if (!result?.product_id) return;
    setAnchoring(true);
    try {
      const res = await apiService.anchorProduct({
        productId: result.product_id,
        productName: result.product_name || form.product_name || 'Sample Product',
        verdict: counterfeit ? 'counterfeit' : 'authentic',
        score: result.authenticity_score ?? 0,
      });
      setAnchor(res);
    } catch (e: any) {
      setAnchor({ success: false, anchored: false, reason: e?.message || 'Anchoring failed' });
    } finally {
      setAnchoring(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Analyze a product</Typography>
          <Stack spacing={2}>
            <TextField label="Product name" value={form.product_name} onChange={set('product_name')} fullWidth />
            <TextField label="Description" value={form.description} onChange={set('description')} fullWidth multiline minRows={3} />
            <Stack direction="row" spacing={2}>
              <TextField label="Price (USD)" value={form.price} onChange={set('price')} type="number" sx={{ flex: 1 }} />
              <TextField label="Category" value={form.category} onChange={set('category')} sx={{ flex: 1 }} />
            </Stack>
            <Button variant="contained" onClick={submit} disabled={loading}>
              {loading ? 'Analyzing…' : 'Run AI analysis'}
            </Button>
            {loading && <LinearProgress />}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Result</Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          {!result && !error && <Typography variant="body2">Submit a product to see its authenticity verdict.</Typography>}
          {result && (
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                {counterfeit ? <GppMaybeIcon color="error" /> : <VerifiedIcon color="success" />}
                <Chip
                  label={counterfeit ? 'Likely counterfeit' : 'Authentic'}
                  color={counterfeit ? 'error' : 'success'}
                  variant="outlined"
                />
                <Typography variant="h4" sx={{ ml: 'auto', fontWeight: 800 }}>{score}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={score} color={counterfeit ? 'error' : 'success'} sx={{ height: 8, borderRadius: 4 }} />
              {result.ai_analysis && (<><Divider /><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{result.ai_analysis}</Typography></>)}
              {Array.isArray(result.recommendations) && result.recommendations.length > 0 && (
                <Box>
                  <Typography variant="overline" color="primary">Recommendations</Typography>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#A1A1AA' }}>
                    {result.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </Box>
              )}

              {verifyPath && (
                <>
                  <Divider />
                  <Typography variant="overline" color="primary">Public record</Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: 1.5, background: '#fff', lineHeight: 0 }}>
                      <QRCodeSVG value={verifyUrl} size={84} level="M" />
                    </Box>
                    <Stack spacing={1} sx={{ minWidth: 0 }}>
                      <Typography variant="body2">
                        Anyone can check this verdict — print the QR on a label or share the link.
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button component={RouterLink} to={verifyPath} size="small" variant="outlined" endIcon={<LaunchIcon />}>
                          Open record
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<AnchorIcon />}
                          onClick={anchorVerdict}
                          disabled={anchoring || !!anchor?.anchored}
                        >
                          {anchoring ? 'Anchoring…' : anchor?.anchored ? 'Anchored on Hedera' : 'Anchor to Hedera'}
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                  {anchor && anchor.anchored && (
                    <Alert severity="success" icon={<VerifiedIcon />}>
                      Verdict anchored to HCS
                      {anchor.topicId ? ` — topic ${anchor.topicId}` : ''}
                      {anchor.sequenceNumber != null ? `, message #${anchor.sequenceNumber}` : ''}.{' '}
                      {anchor.explorerUrl && (
                        <a href={anchor.explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                          View on HashScan
                        </a>
                      )}
                    </Alert>
                  )}
                  {anchor && !anchor.anchored && (
                    <Alert severity="info">
                      Not anchored: {anchor.reason || anchor.error || 'the Hedera anchoring service is not configured.'}
                    </Alert>
                  )}
                </>
              )}

              <Typography variant="caption" color="text.secondary">
                Processed in {result.processing_time_ms ?? '—'} ms · product #{result.product_id ?? '—'}
                {result.hedera_nft_ready ? ' · NFT-ready' : ''}
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ProductAnalysis;
