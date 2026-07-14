/**
 * VeriChainX public verification page — /verify/:id
 *
 * The consumer-facing "digital product passport": no login, mobile-first
 * (the expected entry point is a phone scanning a QR label). Shows the AI
 * verdict as an animated trust ring, the reasoning behind it, and the
 * product's on-chain anchor with a HashScan deep link.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Container, Stack, Typography, Chip, Card, CardContent, Divider, Button,
  Skeleton, Link as MuiLink, useMediaQuery, Snackbar,
} from '@mui/material';
import { useParams, Link as RouterLink } from 'react-router-dom';
import VerifiedIcon from '@mui/icons-material/Verified';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LaunchIcon from '@mui/icons-material/Launch';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IosShareIcon from '@mui/icons-material/IosShare';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { QRCodeSVG } from 'qrcode.react';
import { apiService, ProductDetail } from '../services/api';
import { VIOLET, CYAN } from '../theme';

const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const RED = '#EF4444';

type Verdict = 'authentic' | 'inconclusive' | 'counterfeit';

const verdictOf = (p: ProductDetail): Verdict => {
  if (p.is_counterfeit) return 'counterfeit';
  if (p.authenticity_score >= 0.8) return 'authentic';
  return 'inconclusive';
};

const VERDICT_META: Record<Verdict, { label: string; color: string; icon: React.ReactNode; line: string }> = {
  authentic: {
    label: 'Authentic',
    color: GREEN,
    icon: <VerifiedIcon sx={{ fontSize: 28 }} />,
    line: 'AI analysis found no counterfeit signals for this product.',
  },
  inconclusive: {
    label: 'Needs review',
    color: AMBER,
    icon: <HelpOutlineIcon sx={{ fontSize: 28 }} />,
    line: 'The AI could not fully confirm authenticity. Review the evidence below.',
  },
  counterfeit: {
    label: 'Likely counterfeit',
    color: RED,
    icon: <GppMaybeIcon sx={{ fontSize: 28 }} />,
    line: 'AI analysis flagged strong counterfeit signals for this product.',
  },
};

/** Animated trust ring — draws to the score on load and counts up. */
const TrustRing: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shown, setShown] = useState(reduceMotion ? score : 0);
  const raf = useRef<number>(0);

  const R = 66;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    if (reduceMotion) { setShown(score); return; }
    const t0 = performance.now();
    const dur = 1200;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(score * eased));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [score, reduceMotion]);

  return (
    <Box sx={{ position: 'relative', width: 168, height: 168, flexShrink: 0 }}>
      <svg width="168" height="168" viewBox="0 0 168 168" role="img" aria-label={`Trust score ${score} out of 100`}>
        <circle cx="84" cy="84" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="84" cy="84" r={R} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown / 100)}
          transform="rotate(-90 84 84)"
          style={reduceMotion ? undefined : { transition: 'stroke-dashoffset 80ms linear' }}
        />
      </svg>
      <Stack sx={{ position: 'absolute', inset: 0 }} alignItems="center" justifyContent="center" spacing={0}>
        <Typography sx={{ fontSize: '2.6rem', fontWeight: 800, lineHeight: 1, color }}>{shown}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>TRUST SCORE</Typography>
      </Stack>
    </Box>
  );
};

const TimelineRow: React.FC<{
  color: string; title: string; time?: string | null; last?: boolean; children?: React.ReactNode;
}> = ({ color, title, time, last, children }) => (
  <Stack direction="row" spacing={2}>
    <Stack alignItems="center" sx={{ pt: 0.4 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}` }} />
      {!last && <Box sx={{ flex: 1, width: '1px', background: 'rgba(255,255,255,0.12)', my: 0.5 }} />}
    </Stack>
    <Box sx={{ pb: last ? 0 : 2.5, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      {time && <Typography variant="caption" color="text.secondary">{new Date(time).toLocaleString()}</Typography>}
      {children}
    </Box>
  </Stack>
);

export const VerifyPage: React.FC = () => {
  const { id } = useParams();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiService.getProduct(id)
      .then(setProduct)
      .catch((e) => setError(e?.response?.status === 404
        ? 'No record found for this ID. The product may not be registered on this network.'
        : 'The verification service is unreachable right now. Try again in a moment.'));
  }, [id]);

  const pageUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), []);
  // Share the /s/ URL: it serves OG meta so links unfurl as verdict cards,
  // then forwards humans straight back to this page.
  const shareUrl = useMemo(() => (typeof window !== 'undefined' && id ? `${window.location.origin}/s/${id}` : ''), [id]);
  const verdict = product ? verdictOf(product) : null;
  const meta = verdict ? VERDICT_META[verdict] : null;
  const score = product ? Math.round(product.authenticity_score * 100) : 0;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl || pageUrl); setCopied(true); } catch { /* clipboard unavailable */ }
  };
  const share = async () => {
    if (navigator.share && product) {
      try { await navigator.share({ title: `${product.name} — VeriChainX verdict`, url: shareUrl || pageUrl }); } catch { /* cancelled */ }
    } else copyLink();
  };

  return (
    <Box sx={{ minHeight: '100vh', pb: 8 }}>
      {/* Header */}
      <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,15,0.6)', backdropFilter: 'blur(12px)' }}>
        <Container maxWidth="sm">
          <Stack direction="row" alignItems="center" spacing={1.2} sx={{ height: 60 }}>
            <Box component={RouterLink} to="/" sx={{ width: 26, height: 26, borderRadius: '7px', background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, color: '#fff', textDecoration: 'none' }}>◆</Box>
            <Typography sx={{ fontWeight: 800 }}>VeriChainX</Typography>
            <Chip size="small" variant="outlined" label="Authenticity record" sx={{ ml: 0.5 }} />
            <Box sx={{ flex: 1 }} />
            {product && <Chip size="small" label={product.network} sx={{ color: CYAN, borderColor: 'rgba(34,211,238,0.4)' }} variant="outlined" />}
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="sm" sx={{ pt: 4 }}>
        {error && (
          <Card><CardContent sx={{ textAlign: 'center', py: 6 }}>
            <GppMaybeIcon sx={{ fontSize: 40, color: AMBER, mb: 1 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>Record unavailable</Typography>
            <Typography variant="body2" sx={{ mb: 3 }}>{error}</Typography>
            <Button component={RouterLink} to="/" variant="outlined">Go to VeriChainX</Button>
          </CardContent></Card>
        )}

        {!product && !error && (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={220} />
            <Skeleton variant="rounded" height={140} />
            <Skeleton variant="rounded" height={180} />
          </Stack>
        )}

        {product && meta && (
          <Stack spacing={2.5}>
            {/* Verdict hero */}
            <Card sx={{ borderColor: `${meta.color}55`, boxShadow: `0 0 40px ${meta.color}22` }}>
              <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
                  <TrustRing score={score} color={meta.color} />
                  <Stack spacing={1.2} alignItems={{ xs: 'center', sm: 'flex-start' }} sx={{ textAlign: { xs: 'center', sm: 'left' }, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: meta.color }}>
                      {meta.icon}
                      <Typography variant="h5" sx={{ color: meta.color, fontWeight: 800 }}>{meta.label}</Typography>
                    </Stack>
                    <Typography variant="h4" sx={{ wordBreak: 'break-word' }}>{product.name}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'center', sm: 'flex-start' }}>
                      {product.brand && <Chip size="small" variant="outlined" label={product.brand} />}
                      {product.category && <Chip size="small" variant="outlined" label={product.category} />}
                      {product.price > 0 && <Chip size="small" variant="outlined" label={`$${product.price.toLocaleString()}`} />}
                    </Stack>
                    <Typography variant="body2">{meta.line}</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            {/* AI reasoning */}
            <Card>
              <CardContent>
                <Typography variant="overline" color="primary">Why the AI decided this</Typography>
                {product.ai_analysis && (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{product.ai_analysis}</Typography>
                )}
                {product.evidence.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="overline" color="primary">Evidence</Typography>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#A1A1AA' }}>
                      {product.evidence.map((e, i) => <li key={i}><Typography variant="body2" component="span">{e}</Typography></li>)}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            {/* History */}
            <Card>
              <CardContent>
                <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 2 }}>History</Typography>
                <TimelineRow color={CYAN} title="Registered for analysis" time={product.created_at} />
                <TimelineRow color={meta.color} title={`AI verdict: ${meta.label} (${score}/100)`} time={product.created_at} last={!product.anchor} >
                  {!product.anchor && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Not yet anchored on-chain.
                    </Typography>
                  )}
                </TimelineRow>
                {product.anchor && (
                  <TimelineRow color={VIOLET} title="Anchored on Hedera Consensus Service" time={product.anchor.anchored_at} last>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {product.anchor.topic_id && (
                        <Typography variant="caption" color="text.secondary">
                          Topic {product.anchor.topic_id}
                          {product.anchor.sequence_number != null && ` · message #${product.anchor.sequence_number}`}
                        </Typography>
                      )}
                      {product.anchor.explorer_url && (
                        <MuiLink href={product.anchor.explorer_url} target="_blank" rel="noopener" underline="hover"
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: CYAN, fontSize: '0.85rem' }}>
                          Verify independently on HashScan <LaunchIcon sx={{ fontSize: 14 }} />
                        </MuiLink>
                      )}
                    </Stack>
                  </TimelineRow>
                )}
              </CardContent>
            </Card>

            {/* Share */}
            <Card>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
                  <Box sx={{ p: 1.5, borderRadius: 2, background: '#fff', lineHeight: 0 }}>
                    <QRCodeSVG value={pageUrl} size={116} level="M" />
                  </Box>
                  <Stack spacing={1.5} sx={{ flex: 1, width: '100%' }}>
                    <Typography variant="body2">
                      This record is public. Scan the code or share the link — anyone can check this verdict without an account.
                    </Typography>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyLink}>Copy link</Button>
                      <Button size="small" variant="outlined" startIcon={<IosShareIcon />} onClick={share}>Share</Button>
                      <Button component={RouterLink} to={`/certificate/${product.id}`} size="small" variant="outlined" startIcon={<WorkspacePremiumIcon />}>
                        {verdict === 'counterfeit' ? 'Get report' : 'Certificate'}
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              Record #{product.id} · Verified by VeriChainX · Anchored on Hedera {product.network}
            </Typography>
          </Stack>
        )}
      </Container>

      <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)} message="Link copied" />
    </Box>
  );
};

export default VerifyPage;
