import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import QRCode from 'qrcode';
import {
  Key,
  ShieldCheck,
  Lock,
  Clock,
  CreditCard,
  Download,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Sparkles,
  Monitor,
  Check,
  RefreshCw,
  X,
  XCircle,
  Barcode,
  HelpCircle,
  Eye,
  EyeOff,
  QrCode,
  Camera,
  Upload,
  PhoneCall,
  MessageSquare,
  Shield,
  Wifi,
  WifiOff,
  ArrowLeftRight,
  Crown,
  Star,
  Award,
  Zap,
  Flame,
  Volume2,
  Radio,
  BarChart3,
  TrendingUp,
  Info,
  DollarSign,
  Users,
  Laptop,
  Send,
  Layers,
  Cpu
} from 'lucide-react';
import {
  loadLicenseData,
  processPaidActivation,
  PLAN_CONFIGS,
  ADMIN_WHATSAPP,
  getMachineHardwareID,
  generateLicenseKey,
  verifyLicenseKeyFormat,
  LicenseData,
  applyMigrationTokenOnNewHardware,
  performActivationAutoCleanup,
  processQRActivation,
  getLicenseStatistics
} from './lib/licenseCrypto';
import {
  setupMasterUpdateListener,
  getInstalledSoftwareVersion,
  checkForNewerMasterUpdate,
  applyMasterSoftwareUpdate,
  MasterUpdatePackage
} from './lib/autoUpdateSync';
import { AdminLicensePanel } from './components/AdminLicensePanel';
import { SettingsPasswordModal } from './components/SettingsPasswordModal';

interface LicenseInfo {
  activated: boolean;
  isTrial: boolean;
  isPermanent?: boolean;
  pharmacyName: string;
  txnId?: string;
  licenseKey?: string;
  activatedAt?: string;
  expiresAt?: string;
  planMonths?: number;
  hwid: string;
  daysRemaining: number;
  isExpired: boolean;
}

export default function App() {
  const [licenseData, setLicenseData] = useState<LicenseInfo | null>(null);
  const [showActivationModal, setShowActivationModal] = useState<boolean>(false);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [showSettingsAuthModal, setShowSettingsAuthModal] = useState<boolean>(false);
  const [settingsAuthSuccessCb, setSettingsAuthSuccessCb] = useState<(() => void) | null>(null);
  const [inputTxnKey, setInputTxnKey] = useState<string>('');
  const [pharmacyInput, setPharmacyInput] = useState<string>('Khyber Medicos');
  const [planMonths, setPlanMonths] = useState<number>(12);
  const [activationPassword, setActivationPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isCopiedHWID, setIsCopiedHWID] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string>('');
  const [waQrUrl, setWaQrUrl] = useState<string>('');
  const [activeQrTab, setActiveQrTab] = useState<'easypaisa' | 'whatsapp' | 'scan' | 'transfer'>('easypaisa');
  const [activationMainTab, setActivationMainTab] = useState<'quick' | 'qr' | 'plans' | 'diagnostics'>('quick');
  const [migrationTokenInput, setMigrationTokenInput] = useState<string>('');
  const [pastedQrPayload, setPastedQrPayload] = useState<string>('');
  const [dismissedRenewalNotice, setDismissedRenewalNotice] = useState<boolean>(false);
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [detectedQrInfo, setDetectedQrInfo] = useState<{
    type: string;
    badge: string;
    color: string;
    details: string;
    raw: string;
  } | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);

  // Multi-PC Auto-Update Broadcast & Fleet Sync State
  const [currentInstalledVersion, setCurrentInstalledVersion] = useState<string>(getInstalledSoftwareVersion());
  const [incomingMasterUpdate, setIncomingMasterUpdate] = useState<MasterUpdatePackage | null>(null);
  const [showAutoUpdateToast, setShowAutoUpdateToast] = useState<boolean>(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState<boolean>(false);
  const [showVersionModal, setShowVersionModal] = useState<boolean>(false);

  // Screen Density / Laptop Scaling (100%, 90%, 85%, 80%, 75%)
  const [uiScale, setUiScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pharma_ui_scale');
      if (saved) return Number(saved);
      if (typeof window !== 'undefined' && (window.innerHeight <= 800 || window.innerWidth <= 1400)) {
        return 90;
      }
    } catch (e) {}
    return 100;
  });

  const applyUiScale = useCallback((scalePercent: number) => {
    setUiScale(scalePercent);
    try {
      localStorage.setItem('pharma_ui_scale', String(scalePercent));
      if (typeof document !== 'undefined' && document.documentElement) {
        (document.documentElement.style as any).zoom = `${scalePercent}%`;
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale, applyUiScale]);

  // Expose global window hooks for vanilla JS, HTML, and keyboard shortcuts
  useEffect(() => {
    (window as any).showAdminLicensePanel = () => setShowAdminPanel(true);
    (window as any).openAdminLicensePanel = () => setShowAdminPanel(true);
    (window as any).openVersionUpdates = () => setShowVersionModal(true);
    (window as any).requestSettingsAccess = (cb: () => void) => {
      setSettingsAuthSuccessCb(() => cb);
      setShowSettingsAuthModal(true);
    };
    (window as any)._reactPromptSettingsPasswordModal = (cb: () => void) => {
      setSettingsAuthSuccessCb(() => cb);
      setShowSettingsAuthModal(true);
    };
    (window as any).setSoftwareUiScale = applyUiScale;

    // Intercept Settings Navigation Clicks globally if not unlocked
    const handleGlobalSettingsIntercept = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const btn = target.closest('#nav-settings, [data-module="settings"]');
      if (btn) {
        const isUnlocked = sessionStorage.getItem('pharma_settings_unlocked') === 'true';
        if (!isUnlocked) {
          e.preventDefault();
          e.stopPropagation();
          setShowSettingsAuthModal(true);
        }
      }
    };

    // Keyboard Shortcuts: F9 = Admin Panel, F10 = Fleet Updates, Ctrl+Alt+S = Toggle Scale
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9' || (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        setShowAdminPanel(prev => !prev);
      } else if (e.key === 'F10' || (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'u')) {
        e.preventDefault();
        setShowVersionModal(true);
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        applyUiScale(uiScale === 100 ? 90 : uiScale === 90 ? 80 : 100);
      }
    };

    const handleCustomOpenAdmin = () => setShowAdminPanel(true);
    const handleCustomOpenVersion = () => setShowVersionModal(true);

    document.addEventListener('click', handleGlobalSettingsIntercept, true);
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('pharma_open_admin_panel', handleCustomOpenAdmin);
    window.addEventListener('pharma_open_version_modal', handleCustomOpenVersion);

    return () => {
      document.removeEventListener('click', handleGlobalSettingsIntercept, true);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('pharma_open_admin_panel', handleCustomOpenAdmin);
      window.removeEventListener('pharma_open_version_modal', handleCustomOpenVersion);
    };
  }, [applyUiScale, uiScale]);

  // Automatic Background Master-to-Client Update Listener
  useEffect(() => {
    // 1. Check on load if a newer master version was published
    const newer = checkForNewerMasterUpdate();
    if (newer) {
      setIncomingMasterUpdate(newer);
      setShowAutoUpdateToast(true);
    }

    // 2. Setup live realtime broadcast listener from Owner Laptop
    const cleanup = setupMasterUpdateListener((pkg) => {
      setCurrentInstalledVersion(pkg.version);
      setIncomingMasterUpdate(pkg);
      setShowAutoUpdateToast(true);

      if ((window as any).alertManager) {
        (window as any).alertManager.showToast(
          `🚀 Master Update (${pkg.version}) received from Owner Laptop! Automatically saved on this PC.`,
          'success',
          7000
        );
      }
    });

    return () => cleanup();
  }, []);

  // Check for Updates manually
  const handleManualCheckForUpdates = () => {
    setIsCheckingForUpdates(true);
    setTimeout(() => {
      const newer = checkForNewerMasterUpdate();
      setIsCheckingForUpdates(false);
      if (newer) {
        setIncomingMasterUpdate(newer);
        setShowAutoUpdateToast(true);
      } else {
        if ((window as any).alertManager) {
          (window as any).alertManager.showToast(
            `✨ All Systems Up to Date! Running latest version (${currentInstalledVersion}) synchronized with Owner Laptop.`,
            'info',
            4000
          );
        }
      }
    }, 700);
  };

  // Play subtle pleasant beep notification using Web Audio API on successful QR decode
  const playQrDecodeBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Harmonic chime beep: 880Hz (A5) -> 1320Hz (E6)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.07);

      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (err) {
      console.debug('QR Audio beep notification notice:', err);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  // Generate dynamic EasyPaisa and WhatsApp QR Code data URLs
  useEffect(() => {
    const hwid = licenseData?.hwid || getMachineHardwareID();
    const priceMap: Record<number, number> = {};
    for (const [m, cfg] of Object.entries(PLAN_CONFIGS)) {
      priceMap[Number(m)] = cfg.pkr;
    }
    const price = priceMap[planMonths] || 60000;

    // 1. EasyPaisa Payment QR Payload
    const paymentPayload = `ACCOUNT:03365766177|TITLE:Salman Said|AMOUNT:PKR ${price}|PLAN:${planMonths} Month(s)|HWID:${hwid}`;
    QRCode.toDataURL(paymentPayload, { margin: 1, width: 220, color: { dark: '#022c22', light: '#ffffff' } })
      .then(url => setPaymentQrUrl(url))
      .catch(err => console.error(err));

    // 2. WhatsApp Instant Password QR Payload
    const waMsg = `Assalam-o-Alaikum! Requesting 10-Digit Activation Password for PharmaCare POS.\nPharmacy Name: ${pharmacyInput}\nMachine HWID: ${hwid}\nSelected Plan: ${planMonths} Month(s) (PKR ${price})`;
    const waUrl = `https://wa.me/923410781866?text=${encodeURIComponent(waMsg)}`;
    QRCode.toDataURL(waUrl, { margin: 1, width: 220, color: { dark: '#064e3b', light: '#ffffff' } })
      .then(url => setWaQrUrl(url))
      .catch(err => console.error(err));
  }, [planMonths, pharmacyInput, licenseData?.hwid]);

  // Intelligent QR Payload Parser with Auto-Detect QR Type and Beep Sound
  const handleParseQrPayload = (rawPayload: string, triggerBeep: boolean = true) => {
    setPastedQrPayload(rawPayload);
    if (!rawPayload.trim()) {
      setDetectedQrInfo(null);
      return;
    }

    if (triggerBeep) {
      playQrDecodeBeep();
    }

    const clean = rawPayload.trim();

    // 1. Signed QR Activation Package
    if (clean.startsWith('PHARMA-QR-ACT:')) {
      setDetectedQrInfo({
        type: 'Signed QR License Package',
        badge: 'SIGNED QR LICENSE',
        color: 'emerald',
        details: 'Cryptographically signed offline activation package. Executing instant activation...',
        raw: clean
      });

      const res = processQRActivation(clean, pharmacyInput);
      if (res.success) {
        setStatusMessage({ type: 'success', text: '🎉 ' + res.message });
        refreshLicenseState();
        setTimeout(() => {
          setShowActivationModal(false);
          if ((window as any).app && (window as any).app.switchModule) {
            (window as any).app.switchModule('dashboard');
          }
        }, 1500);
        return;
      } else {
        triggerShake();
        setStatusMessage({ type: 'error', text: res.message });
        return;
      }
    }

    // 2. Migration Token
    if (clean.startsWith('MIGRATE-') || clean.startsWith('PHARMA-MIGRATE:')) {
      setDetectedQrInfo({
        type: 'Hardware Migration Token',
        badge: 'MIGRATION TOKEN',
        color: 'indigo',
        details: 'License migration token from previous terminal. Ready for hardware transfer.',
        raw: clean
      });
      setMigrationTokenInput(clean);
      setActiveQrTab('transfer');
      setStatusMessage({
        type: 'success',
        text: '🔄 Migration Token auto-detected! Click "Apply Migration Token" below to activate on this machine.'
      });
      return;
    }

    // 3. Structured JSON Configuration
    if ((clean.startsWith('{') && clean.endsWith('}')) || (clean.startsWith('[') && clean.endsWith(']'))) {
      try {
        const parsed = JSON.parse(clean);
        const key = parsed.key || parsed.licenseKey || parsed.txnId || '';
        const pwd = parsed.password || parsed.adminPassword || parsed.pwd || '';
        const plan = Number(parsed.plan || parsed.planMonths || 12);
        const pharmacy = parsed.pharmacy || parsed.pharmacyName || '';

        if (key) setInputTxnKey(key);
        if (pwd) setActivationPassword(pwd);
        if (plan && PLAN_CONFIGS[plan]) setPlanMonths(plan);
        if (pharmacy) setPharmacyInput(pharmacy);

        setDetectedQrInfo({
          type: 'Structured JSON License Configuration',
          badge: 'JSON CONFIG',
          color: 'cyan',
          details: `Auto-populated: Key (${key ? '✓' : 'Generated'}), Password (${pwd ? '✓' : '-'}), Plan (${plan}M), Store (${pharmacy || 'Saved'}).`,
          raw: clean
        });

        setStatusMessage({
          type: 'success',
          text: `✨ Structured JSON license configuration auto-detected & populated!`
        });
        return;
      } catch (e) {
        // Continue to other parsers
      }
    }

    // 4. Pipe-Delimited Key-Value Format
    if (clean.includes('|') || clean.includes(';')) {
      const parts = clean.split(/[|;]/);
      let extractedKey = '';
      let extractedPass = '';
      let extractedPlan = 0;
      let isPaymentQR = false;

      parts.forEach(part => {
        const [k, v] = part.split(':').map(s => s.trim());
        if (!k || !v) return;
        const upperK = k.toUpperCase();
        if (['KEY', 'LICENSE', 'TXN', 'LIC'].includes(upperK)) extractedKey = v;
        if (['PASS', 'PASSWORD', 'PWD', 'ADMIN'].includes(upperK)) extractedPass = v;
        if (['PLAN', 'MONTHS', 'DURATION'].includes(upperK)) extractedPlan = parseInt(v) || 0;
        if (['ACCOUNT', 'TITLE', 'AMOUNT'].includes(upperK)) isPaymentQR = true;
      });

      if (isPaymentQR) {
        setDetectedQrInfo({
          type: 'EasyPaisa Merchant Payment QR',
          badge: 'PAYMENT QR',
          color: 'amber',
          details: 'Official EasyPaisa receiving account & transaction details scanned.',
          raw: clean
        });
        setStatusMessage({
          type: 'info',
          text: '💳 EasyPaisa Payment QR reference detected.'
        });
        return;
      }

      if (extractedKey || extractedPass) {
        if (extractedKey) setInputTxnKey(extractedKey);
        if (extractedPass) setActivationPassword(extractedPass);
        if (extractedPlan && PLAN_CONFIGS[extractedPlan]) setPlanMonths(extractedPlan);

        setDetectedQrInfo({
          type: 'Key-Password License Bundle',
          badge: 'LICENSE BUNDLE',
          color: 'teal',
          details: `Populated Key (${extractedKey || 'Auto'}) & Password (${extractedPass || 'Set'}).`,
          raw: clean
        });
        setStatusMessage({
          type: 'success',
          text: '✨ License Key & Password Bundle auto-detected & populated!'
        });
        return;
      }
    }

    // 5. 10-Digit Owner Password
    if (/^\d{10}$/.test(clean) || clean.startsWith('PASS:') || clean.startsWith('PASSWORD:')) {
      const cleanPwd = clean.replace(/^(PASS|PASSWORD|PWD):/i, '').trim();
      setActivationPassword(cleanPwd);
      if (!inputTxnKey) {
        const hwid = licenseData?.hwid || getMachineHardwareID();
        setInputTxnKey(generateLicenseKey(hwid, planMonths));
      }
      setDetectedQrInfo({
        type: '10-Digit Owner Administrator Password',
        badge: 'OWNER PASSWORD (10-DIGIT)',
        color: 'purple',
        details: `Verified 10-digit owner cryptographic password (${cleanPwd}) auto-filled into Password field.`,
        raw: clean
      });
      setStatusMessage({
        type: 'success',
        text: `🔑 10-Digit Owner Password (${cleanPwd}) auto-detected!`
      });
      return;
    }

    // 6. 4x4 Hardware License Key
    const keyMatch = clean.match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    if (keyMatch) {
      const keyVal = keyMatch[0].toUpperCase();
      setInputTxnKey(keyVal);
      if (!activationPassword) {
        const planCfg = PLAN_CONFIGS[planMonths];
        setActivationPassword(planCfg?.defaultAdminPassword || '1234567890');
      }
      setDetectedQrInfo({
        type: 'Cryptographic Hardware License Key',
        badge: 'LICENSE KEY',
        color: 'blue',
        details: `Standard 4x4 license key format (${keyVal}) auto-filled into License Key field.`,
        raw: clean
      });
      setStatusMessage({
        type: 'success',
        text: `✨ License Key (${keyVal}) auto-detected!`
      });
      return;
    }

    // 7. Machine Hardware ID (HWID)
    if (clean.startsWith('HWID-') || clean.startsWith('PHARMA-HWID-')) {
      setDetectedQrInfo({
        type: 'Machine Hardware Fingerprint (HWID)',
        badge: 'MACHINE HWID',
        color: 'cyan',
        details: `Target terminal hardware fingerprint (${clean}) scanned.`,
        raw: clean
      });
      setStatusMessage({
        type: 'info',
        text: `💻 Target Hardware ID (${clean}) scanned.`
      });
      return;
    }

    // 8. General / Fallback
    setInputTxnKey(clean);
    setDetectedQrInfo({
      type: 'General Text / Barcode Payload',
      badge: 'GENERAL STRING',
      color: 'slate',
      details: `Payload string length: ${clean.length} characters. Populated into key/reference field.`,
      raw: clean
    });
    setStatusMessage({
      type: 'info',
      text: `✨ QR Code Payload Loaded: ${clean.substring(0, 30)}${clean.length > 30 ? '...' : ''}`
    });
  };

  // Camera QR scanner lifecycle using html5-qrcode
  useEffect(() => {
    let activeScanner: Html5Qrcode | null = null;

    if (showActivationModal && activeQrTab === 'scan' && isCameraScanning) {
      setCameraError(null);
      const timer = setTimeout(() => {
        const element = document.getElementById('html5-qr-reader');
        if (!element) return;

        try {
          activeScanner = new Html5Qrcode('html5-qr-reader');
          html5QrCodeRef.current = activeScanner;

          activeScanner
            .start(
              { facingMode: 'environment' },
              {
                fps: 10,
                qrbox: { width: 220, height: 220 }
              },
              (decodedText) => {
                handleParseQrPayload(decodedText);
                if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                  html5QrCodeRef.current
                    .stop()
                    .then(() => {
                      html5QrCodeRef.current?.clear();
                      setIsCameraScanning(false);
                    })
                    .catch(console.error);
                }
              },
              () => {
                // frame read errors ignored
              }
            )
            .catch((err) => {
              console.warn('Camera start error:', err);
              setCameraError('Camera access unavailable or permission denied. Upload a QR image or paste text below.');
              setIsCameraScanning(false);
            });
        } catch (e) {
          console.error('Html5Qrcode scanner error:', e);
          setCameraError('Unable to start scanner. Please upload a QR image or paste text below.');
          setIsCameraScanning(false);
        }
      }, 150);

      return () => {
        clearTimeout(timer);
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current
            .stop()
            .then(() => {
              html5QrCodeRef.current?.clear();
            })
            .catch(console.error);
        }
      };
    } else {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current
          .stop()
          .then(() => {
            html5QrCodeRef.current?.clear();
          })
          .catch(console.error);
      }
    }
  }, [showActivationModal, activeQrTab, isCameraScanning]);

  const handleFileUploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const scanner = new Html5Qrcode('html5-qr-file-reader');
      const decodedText = await scanner.scanFile(file, true);
      handleParseQrPayload(decodedText);
      scanner.clear();
    } catch (err) {
      console.warn('QR Image File Scan Error:', err);
      setStatusMessage({
        type: 'error',
        text: '❌ No valid QR code detected in the uploaded image. Try another photo or scan directly.'
      });
    }
  };

  // Helper to load license data from licenseCrypto module
  const refreshLicenseState = useCallback(() => {
    const data = loadLicenseData();
    const info: LicenseInfo = {
      ...data,
      isExpired: data.isLocked || (!data.isPermanent && data.daysRemaining <= 0)
    };
    setLicenseData(info);
    if (data.pharmacyName) setPharmacyInput(data.pharmacyName);

    // If expired or locked, automatically show activation modal
    if (info.isExpired) {
      setShowActivationModal(true);
    }
    return info;
  }, []);

  // Global Route Guard & Settings Protection Interceptor Setup
  useEffect(() => {
    const info = refreshLicenseState();

    // Register React-based System Settings Password Modal Trigger
    (window as any)._reactPromptSettingsPasswordModal = (onSuccess?: () => void) => {
      setSettingsAuthSuccessCb(() => onSuccess || null);
      setShowSettingsAuthModal(true);
    };

    // Hook into window.app module navigation guard
    const setupRouteGuard = () => {
      if ((window as any).app && !(window as any).app._licenseGuardPatched) {
        const originalSwitchModule = (window as any).app.switchModule.bind((window as any).app);

        (window as any).app.switchModule = async function (moduleId: string) {
          const currentData = loadLicenseData();
          const isExpired = currentData.isLocked || (!currentData.isPermanent && currentData.daysRemaining <= 0);

          // Allowed modules even when locked: 'license', 'settings'
          const isAllowed = ['license', 'settings'].includes(moduleId);

          if (isExpired && !isAllowed) {
            if ((window as any).alertManager) {
              (window as any).alertManager.showToast(
                '🔒 Software Locked: 7-Day Free Trial Expired or License Unverified. Please Activate License.',
                'danger',
                5000
              );
            }
            setShowActivationModal(true);
            return originalSwitchModule('license');
          }

          // Intercept System Settings module to enforce Admin-Defined Password Verification
          if (moduleId === 'settings') {
            const isSettingsUnlocked =
              (window as any).app?.isSettingsUnlocked ||
              sessionStorage.getItem('pharma_settings_unlocked') === 'true';

            if (!isSettingsUnlocked) {
              setSettingsAuthSuccessCb(() => () => originalSwitchModule('settings'));
              setShowSettingsAuthModal(true);
              return;
            }
          }

          return originalSwitchModule(moduleId);
        };

        (window as any).app._licenseGuardPatched = true;
      }
    };

    setupRouteGuard();
    const interval = setInterval(() => {
      refreshLicenseState();
      setupRouteGuard();
    }, 2000);

    return () => clearInterval(interval);
  }, [refreshLicenseState]);

  const copyHWID = () => {
    if (licenseData?.hwid) {
      navigator.clipboard.writeText(licenseData.hwid);
      setIsCopiedHWID(true);
      setTimeout(() => setIsCopiedHWID(false), 2000);
    }
  };

  const autoFillValidCredentials = () => {
    const hwid = licenseData?.hwid || getMachineHardwareID();
    const validKey = generateLicenseKey(hwid, planMonths);
    const planCfg = PLAN_CONFIGS[planMonths];
    const pwd = planCfg?.defaultAdminPassword || '1234567890';
    setInputTxnKey(validKey);
    setActivationPassword(pwd);
    setStatusMessage({
      type: 'success',
      text: `✨ Auto-filled HWID License Key (${validKey}) & Password (${pwd})!`
    });
  };

  const handleApplyMigrationToken = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!migrationTokenInput.trim()) {
      setStatusMessage({ type: 'error', text: '❌ Please paste a Migration Token string starting with MIGRATE-...' });
      return;
    }
    const res = applyMigrationTokenOnNewHardware(migrationTokenInput.trim(), pharmacyInput);
    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      refreshLicenseState();
      setMigrationTokenInput('');
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleActivate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!inputTxnKey.trim()) {
      triggerShake();
      setStatusMessage({ type: 'error', text: '❌ Please enter a valid License Key (Format: XXXX-XXXX-XXXX-XXXX).' });
      return;
    }

    if (!activationPassword.trim()) {
      triggerShake();
      setStatusMessage({ type: 'error', text: '🔒 Please enter the mandatory 10-Digit Admin Password.' });
      return;
    }

    setIsVerifying(true);
    setStatusMessage({ type: 'info', text: '⏳ Validating License Key & 10-Digit Admin Password...' });

    try {
      const res = processPaidActivation(inputTxnKey.trim(), activationPassword.trim(), planMonths, pharmacyInput);
      if (res.success) {
        const offlineNote = !navigator.onLine ? ' ⚡ [Offline On-Device HWID Verification Success]' : '';
        setStatusMessage({ type: 'success', text: res.message + offlineNote });
        refreshLicenseState();
        setTimeout(() => {
          setShowActivationModal(false);
          if ((window as any).app && (window as any).app.switchModule) {
            (window as any).app.switchModule('dashboard');
          }
        }, 1500);
      } else {
        triggerShake();
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      triggerShake();
      setStatusMessage({ type: 'error', text: '❌ Activation error: ' + err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const triggerPWAInstall = () => {
    if (typeof (window as any).triggerPWAInstall === 'function') {
      (window as any).triggerPWAInstall();
    } else if ((window as any).app?.showExeInstallerModal) {
      (window as any).app.showExeInstallerModal();
    } else {
      alert('📱 Click Chrome/Edge menu (⋮) -> "Install PharmaCare PK" to install as a standalone Desktop App.');
    }
  };

  if (!licenseData) return null;

  const isValidKeyFormat = verifyLicenseKeyFormat(
    inputTxnKey,
    licenseData.hwid || getMachineHardwareID(),
    planMonths
  );

  return (
    <div className="w-full text-sans">
      {/* GLOBAL LICENSE ROUTE GUARD HEADER BANNER */}
      <div
        className={`w-full px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 shadow-md transition-all ${
          licenseData.isExpired
            ? 'bg-rose-950/95 border-rose-500/80 text-rose-200'
            : !licenseData.isPermanent && licenseData.daysRemaining <= 5
            ? 'bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-amber-400 text-amber-100 ring-1 ring-amber-400/50 shadow-amber-950/50'
            : !licenseData.isPermanent && licenseData.daysRemaining <= 15
            ? 'bg-amber-950/95 border-amber-500/80 text-amber-200'
            : licenseData.isTrial
            ? 'bg-amber-950/90 border-amber-500/80 text-amber-200'
            : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
        }`}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          {licenseData.isExpired ? (
            <div className="flex items-center gap-2 bg-rose-900/60 px-2.5 py-1 rounded-lg border border-rose-500/60 font-bold animate-pulse">
              <Lock className="w-4 h-4 text-rose-400" />
              <span>SOFTWARE LOCKED — 7-DAY FREE TRIAL EXPIRED</span>
            </div>
          ) : !licenseData.isPermanent && licenseData.daysRemaining <= 5 ? (
            /* STANDOUT VISUAL ALERT INDICATOR IN HEADER (FINAL 5 DAYS) - ALL BOX BACKGROUND GOLDEN */
            <div className="flex items-center gap-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 px-3.5 py-1.5 rounded-xl border-2 border-yellow-200 font-black shadow-lg shadow-amber-900/60 animate-pulse ring-2 ring-yellow-400/50">
              <AlertTriangle className="w-4 h-4 text-slate-950 animate-bounce shrink-0" />
              <span className="uppercase tracking-wide">⚠️ CRITICAL: FINAL {licenseData.daysRemaining} DAYS REMAINING!</span>
              <span className="bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-300 text-slate-950 px-3 py-1 rounded-lg text-xs font-mono font-black border-2 border-yellow-600 shadow-inner flex items-center gap-1.5">
                <span className="text-slate-950 font-extrabold uppercase text-[10px]">To Expiry Date:</span>
                <strong className="text-slate-950 font-black">
                  {new Date(licenseData.expiresAt || '').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </strong>
              </span>
            </div>
          ) : !licenseData.isPermanent && licenseData.daysRemaining <= 15 ? (
            <div className="flex items-center gap-2 bg-amber-900/80 px-2.5 py-1 rounded-lg border border-amber-400/80 font-black text-amber-300 animate-pulse shadow-md">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>SUBSCRIPTION EXPIRING SOON ({licenseData.daysRemaining} Days Remaining)</span>
              <span className="text-xs font-mono bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 font-black px-3 py-1 rounded-lg border-2 border-yellow-200 shadow-md ml-1 inline-flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-extrabold">To Expiry Date:</span>
                <strong className="text-slate-950 font-black">{new Date(licenseData.expiresAt || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
              </span>
            </div>
          ) : licenseData.isTrial ? (
            <div className="flex items-center gap-2 bg-amber-900/60 px-2.5 py-1 rounded-lg border border-amber-500/60 font-bold">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>7 DAYS FREE TRIAL ACTIVE ({licenseData.daysRemaining} Days Remaining)</span>
              <span className="text-xs font-mono bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 font-black px-3 py-1 rounded-lg border-2 border-yellow-200 shadow-md ml-1 inline-flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-extrabold">To Expiry Date:</span>
                <strong className="text-slate-950 font-black">{new Date(licenseData.expiresAt || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-900/60 px-2.5 py-1 rounded-lg border border-emerald-500/60 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                {licenseData.isPermanent ? (
                  'COMMERCIAL ENTERPRISE LIFETIME EDITION'
                ) : (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span>COMMERCIAL LICENSE ACTIVE</span>
                    <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 font-black px-3 py-1 rounded-lg border-2 border-yellow-200 shadow-md text-xs font-mono">
                      <span className="text-[10px] uppercase font-extrabold">To Expiry Date:</span>
                      <strong className="text-slate-950 font-black">
                        {new Date(licenseData.expiresAt || '').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </strong>
                    </span>
                  </span>
                )}
              </span>
            </div>
          )}

          <span className="hidden md:inline-block text-[11px] text-slate-300 font-mono">
            HWID: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-400">{licenseData.hwid}</code>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Laptop Screen Fit & Zoom Controller */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 text-[11px] shadow-sm">
            <span className="text-slate-400 pl-1.5 pr-1 flex items-center gap-1 font-semibold text-[10px]">
              <Laptop className="w-3 h-3 text-cyan-400" />
              <span className="hidden xl:inline">Fit:</span>
            </span>
            {[100, 90, 80].map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => applyUiScale(scale)}
                className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] transition-all cursor-pointer ${
                  uiScale === scale
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title={scale === 90 ? 'Recommended for Laptops (1366x768 / 1080p)' : scale === 80 ? 'Compact Screen Fit (768p / Small Display)' : 'Standard Full Display (100%)'}
              >
                {scale}%
              </button>
            ))}
          </div>

          {/* Multi-PC Fleet Auto-Update Status Badge & Trigger */}
          <button
            onClick={() => setShowVersionModal(true)}
            className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/50 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Auto-Synchronized with Owner Laptop Master Updates"
          >
            {isCheckingForUpdates ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            )}
            <span className="font-mono text-[10px] hidden sm:inline">Fleet Updates:</span>
            <span className="font-mono font-bold text-emerald-400">{currentInstalledVersion}</span>
          </button>

          {/* Owner Admin Panel Trigger */}
          <button
            onClick={() => setShowAdminPanel(true)}
            className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-400/80 rounded-lg font-extrabold text-[11px] flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            title="Owner Admin Panel — Key Generator & Password Management"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>🔑 Owner Admin Panel</span>
          </button>

          {/* PWA / Offline Install Prompt */}
          <button
            onClick={triggerPWAInstall}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg font-extrabold text-[11px] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Install as Standalone Desktop App (Chrome PWA / Windows EXE)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Install Desktop App (PWA/.EXE)</span>
          </button>

          {/* Activate / Renew License Modal Trigger */}
          <button
            onClick={() => setShowActivationModal(true)}
            className={`px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all shadow-lg cursor-pointer ${
              licenseData.isExpired
                ? 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 animate-bounce'
                : !licenseData.isPermanent && licenseData.daysRemaining <= 5
                ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 border-2 border-yellow-200 shadow-amber-950/80 animate-pulse scale-105'
                : !licenseData.isPermanent && licenseData.daysRemaining <= 15
                ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 border border-amber-300 shadow-amber-950/60 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400'
            }`}
          >
            {!licenseData.isPermanent && licenseData.daysRemaining <= 15 ? (
              <Sparkles className="w-4 h-4 text-slate-900" />
            ) : (
              <Key className="w-3.5 h-3.5" />
            )}
            <span>
              {licenseData.isExpired
                ? 'Unlock Software'
                : !licenseData.isPermanent && licenseData.daysRemaining <= 5
                ? `⚠️ Urgent Renewal (${licenseData.daysRemaining} Days Left)`
                : !licenseData.isPermanent && licenseData.daysRemaining <= 15
                ? `⚡ Renew Subscription (${licenseData.daysRemaining} Days Left)`
                : 'Activate License'}
            </span>
          </button>
        </div>
      </div>

      {/* AUTOMATED PROACTIVE 15-DAY RENEWAL NOTICE BANNER */}
      {!licenseData.isExpired && !licenseData.isPermanent && licenseData.daysRemaining <= 15 && !dismissedRenewalNotice && (
        <div className="w-full bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-b-2 border-amber-500/80 px-4 py-3 text-white shadow-2xl flex flex-wrap items-center justify-between gap-3 relative animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 animate-pulse">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-500/30 text-amber-300 border border-amber-400/50 text-[10px] font-black uppercase rounded-md tracking-wider">
                  ⚡ Automated Proactive Subscription Renewal Notice
                </span>
                <span className="text-xs font-mono font-extrabold text-amber-400">
                  ({licenseData.daysRemaining} Days Remaining)
                </span>
              </div>
              <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                Your PharmaCare POS license subscription expires on{' '}
                <strong className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 font-black px-3 py-1 rounded-lg border-2 border-yellow-200 shadow-md font-mono text-xs">
                  {new Date(licenseData.expiresAt || '').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </strong>
                . Proactively renew now to guarantee zero operational downtime or lockout.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowActivationModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-950/60 border border-amber-300 transition-all flex items-center gap-2 cursor-pointer animate-pulse"
            >
              <Sparkles className="w-4 h-4 text-slate-900" />
              <span>Renew Subscription Now</span>
            </button>

            <button
              onClick={() => setDismissedRenewalNotice(true)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Dismiss notice for this session"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MULTI-PC MASTER AUTO-UPDATE NOTIFICATION BANNER */}
      {showAutoUpdateToast && incomingMasterUpdate && (
        <div className="w-full bg-gradient-to-r from-cyan-950 via-slate-950 to-teal-950 border-b-2 border-cyan-500/90 px-4 py-3 text-white shadow-2xl flex flex-wrap items-center justify-between gap-3 relative animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/60 flex items-center justify-center text-cyan-300 shrink-0 shadow-lg shadow-cyan-950/80">
              <Laptop className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 text-[10px] font-black uppercase rounded-md tracking-wider flex items-center gap-1">
                  <Radio className="w-3 h-3 text-cyan-400" />
                  Master Software Update Deployed From Owner Laptop
                </span>
                <span className="text-xs font-mono font-black text-emerald-300 bg-slate-900 px-2 py-0.5 rounded border border-emerald-500/40">
                  {incomingMasterUpdate.version}
                </span>
                <span className="text-[11px] text-cyan-200/90 font-bold">
                  {incomingMasterUpdate.title}
                </span>
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                {incomingMasterUpdate.changelog || 'Latest software improvements, pricing updates, and POS patches have been synchronized.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                applyMasterSoftwareUpdate(incomingMasterUpdate);
                setCurrentInstalledVersion(incomingMasterUpdate.version);
                setShowAutoUpdateToast(false);
                if ((window as any).alertManager) {
                  (window as any).alertManager.showToast(
                    `✨ Update ${incomingMasterUpdate.version} applied successfully to this PC!`,
                    'success',
                    5000
                  );
                }
              }}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-950/60 border border-cyan-300 transition-all flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-slate-950" />
              <span>✓ Auto-Applied on this PC</span>
            </button>

            <button
              onClick={() => setShowAdminPanel(true)}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>View Fleet Hub</span>
            </button>

            <button
              onClick={() => setShowAutoUpdateToast(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* LICENSE ACTIVATION MODAL SCREEN (Compact, Responsive 3D Luxury Screen - Zero Cut-off) */}
      {showActivationModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xl transition-all duration-300 z-[9999] flex items-center justify-center p-2 sm:p-4 font-sans animate-in fade-in duration-200 perspective-container">
          <div
            className={`glass-panel-3d rounded-3xl max-w-4xl w-full max-h-[94vh] md:max-h-[90vh] flex flex-col text-white shadow-2xl relative transition-all duration-300 ${
              isShaking
                ? 'animate-shake border-rose-500 shadow-rose-950/80 ring-4 ring-rose-500/40'
                : 'border-amber-500/60 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),0_0_30px_rgba(245,158,11,0.25)]'
            }`}
          >
            {/* 1. Modal Fixed 3D Header */}
            <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-amber-500/30 bg-gradient-to-r from-slate-950 via-[#130f06] to-slate-950 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-950/60 border border-amber-300/80 animate-float-3d shrink-0">
                  <ShieldCheck className="w-6 h-6 text-slate-950" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black tracking-wide gold-metallic-text">
                      PharmaCare PK License Activation
                    </h2>
                    {licenseData.isExpired ? (
                      <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/50 text-rose-400 text-[10px] rounded-full uppercase font-black animate-pulse">
                        🔒 Locked
                      </span>
                    ) : licenseData.isTrial ? (
                      <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] rounded-full uppercase font-black animate-pulse">
                        ⚡ 7-Day Trial
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[10px] rounded-full uppercase font-black">
                        ✓ Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Offline Cryptographic License Unlock & EasyPaisa Payment Verification
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!licenseData.isExpired && (
                  <button
                    onClick={() => setShowActivationModal(false)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Compact License Validity Progress Meter & HWID Quick Strip */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-2.5 bg-slate-950/90 border-b border-slate-800/80 shrink-0 space-y-2">
              {(() => {
                const daysRemaining = licenseData?.daysRemaining ?? 0;
                const isExpired = licenseData?.isExpired ?? false;
                const isPermanent = licenseData?.isPermanent || (licenseData?.planMonths && licenseData.planMonths >= 240);
                const isTrial = licenseData?.isTrial || (!licenseData?.activated && daysRemaining <= 7);

                let totalDays = 30;
                if (isPermanent) totalDays = 3650;
                else if (isTrial) totalDays = 7;
                else if (licenseData?.planMonths) {
                  totalDays = licenseData.planMonths === 12 ? 365 : licenseData.planMonths * 30;
                } else totalDays = Math.max(daysRemaining, 30);

                const percentage = isPermanent ? 100 : Math.min(100, Math.max(0, Math.round((daysRemaining / totalDays) * 100)));

                let barColorClass = 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]';
                let badgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
                let statusLabel = 'HEALTHY & ACTIVE';
                let statusTextColor = 'text-emerald-400';

                if (isExpired || daysRemaining <= 0) {
                  barColorClass = 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]';
                  badgeClass = 'bg-rose-950/80 text-rose-300 border-rose-500/40';
                  statusLabel = 'EXPIRED / LOCKED';
                  statusTextColor = 'text-rose-400';
                } else if (daysRemaining <= 3 || percentage <= 10) {
                  barColorClass = 'bg-gradient-to-r from-rose-500 via-amber-500 to-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]';
                  badgeClass = 'bg-rose-950/80 text-rose-300 border-rose-500/40';
                  statusLabel = 'URGENT RENEWAL';
                  statusTextColor = 'text-rose-400';
                } else if (daysRemaining <= 15 || percentage <= 30) {
                  barColorClass = 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]';
                  badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-500/40';
                  statusLabel = 'EXPIRING SOON';
                  statusTextColor = 'text-amber-400';
                }

                return (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-lg border ${badgeClass} shrink-0`}>
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                          License Term
                        </span>
                        <span className={`text-xs font-black truncate block ${statusTextColor}`}>
                          {isPermanent
                            ? 'Lifetime Commercial Pass'
                            : isTrial
                            ? '7-Day Free Trial'
                            : `${licenseData?.planMonths || 12} Month Plan`}
                        </span>
                      </div>
                    </div>

                    {/* Compact Meter Progress Bar */}
                    <div className="flex-1 max-w-xs sm:mx-3">
                      <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                        <span className="text-slate-400">Validity Progress</span>
                        <span className={`font-black ${statusTextColor}`}>
                          {isPermanent ? 'UNLIMITED' : `${daysRemaining} / ${totalDays} Days (${percentage}%)`}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${barColorClass}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* HWID Quick Copy Badge */}
                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-900 border border-slate-700/80 px-2 py-1 rounded-xl">
                      <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">HWID:</span>
                      <code className="text-[11px] text-amber-300 font-mono font-bold">{licenseData.hwid}</code>
                      <button
                        type="button"
                        onClick={copyHWID}
                        className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Copy Machine Hardware ID"
                      >
                        {isCopiedHWID ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 3. Interactive 3D Tab Navigation Selector (Organized & Compact) */}
            <div className="px-4 py-2 sm:px-5 bg-slate-900/90 border-b border-amber-500/20 flex flex-wrap gap-1.5 text-xs font-extrabold shrink-0">
              <button
                type="button"
                onClick={() => setActivationMainTab('quick')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activationMainTab === 'quick'
                    ? 'btn-3d-gold text-slate-950 font-black shadow-md'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>⚡ 1-Click Key & PIN Activation</span>
              </button>

              <button
                type="button"
                onClick={() => setActivationMainTab('qr')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activationMainTab === 'qr'
                    ? 'btn-3d-emerald text-white font-black shadow-md'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>💳 EasyPaisa & QR Scanner</span>
              </button>

              <button
                type="button"
                onClick={() => setActivationMainTab('plans')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activationMainTab === 'plans'
                    ? 'btn-3d-cyan text-white font-black shadow-md'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>⭐ 13 Plans & Comparison</span>
              </button>

              <button
                type="button"
                onClick={() => setActivationMainTab('diagnostics')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activationMainTab === 'diagnostics'
                    ? 'bg-purple-600 text-white font-black shadow-md'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>🛡️ Diagnostics & Admin F9</span>
              </button>
            </div>

            {/* 4. Scrollable Modal Body (Custom Gold Scrollbar, Perfectly Sized) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar-gold p-4 sm:p-5 space-y-4">
              
              {/* TAB 1: QUICK KEY & PIN ACTIVATION */}
              {activationMainTab === 'quick' && (
                <div className="space-y-4">
                  {/* Status Banner */}
                  {licenseData.isExpired ? (
                    <div className="bg-rose-950/60 border border-rose-500/60 p-3 rounded-2xl text-xs text-rose-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold text-rose-300 block uppercase tracking-wide">
                          Software Locked / Subscription Expired
                        </strong>
                        <p className="text-[11px] text-rose-200/90 mt-0.5">
                          Enter your License Key or EasyPaisa Payment TRX ID and 10-Digit Admin Password to reactivate instantly.
                        </p>
                      </div>
                    </div>
                  ) : !licenseData.isPermanent && licenseData.daysRemaining <= 15 ? (
                    <div className="bg-amber-950/60 border border-amber-400/80 p-3 rounded-2xl text-xs text-amber-200 flex items-start gap-2.5 shadow-md">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                      <div>
                        <strong className="font-extrabold text-amber-300 block uppercase tracking-wide">
                          ⚡ Proactive Renewal Notice ({licenseData.daysRemaining} Days Remaining)
                        </strong>
                        <p className="text-[11px] text-amber-100/90 mt-0.5">
                          Extend your term now to prevent operational downtime during busy pharmacy hours.
                        </p>
                      </div>
                    </div>
                  ) : licenseData.isTrial ? (
                    <div className="bg-amber-950/50 border border-amber-500/50 p-3 rounded-2xl text-xs text-amber-200 flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold text-amber-300 block uppercase tracking-wide">
                          7-Day Free Trial Mode Active ({licenseData.daysRemaining} Days Left)
                        </strong>
                        <p className="text-[11px] text-amber-200/90 mt-0.5">
                          Upgrade to Annual 12-Month Commercial Pass or Lifetime License anytime.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-950/50 border border-emerald-500/50 p-3 rounded-2xl text-xs text-emerald-200 flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold text-emerald-300 block uppercase tracking-wide">
                          Commercial Edition Active & Verified
                        </strong>
                        <p className="text-[11px] text-emerald-200/90 mt-0.5">
                          Running with on-device AES-256 encrypted indexed database storage.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Activation Form Inputs */}
                  <form onSubmit={handleActivate} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          Pharmacy / Store Name:
                        </label>
                        <input
                          type="text"
                          value={pharmacyInput}
                          onChange={(e) => setPharmacyInput(e.target.value)}
                          placeholder="e.g. Al-Shafa Pharmacy"
                          className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-xs p-2.5 rounded-xl outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1 flex justify-between">
                          <span>Subscription Plan (13 Tiers):</span>
                          <span className="text-emerald-400 font-mono font-bold">
                            PKR {PLAN_CONFIGS[planMonths]?.pkr.toLocaleString()}
                          </span>
                        </label>
                        <select
                          value={planMonths}
                          onChange={(e) => setPlanMonths(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-bold text-xs p-2.5 rounded-xl outline-none focus:border-amber-400 cursor-pointer"
                        >
                          {Object.values(PLAN_CONFIGS).map((cfg) => (
                            <option key={cfg.planMonths} value={cfg.planMonths}>
                              {cfg.label} — PKR {cfg.pkr.toLocaleString()} {cfg.bonusDays > 0 ? `(+${cfg.bonusDays} Free Days)` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* License Key / TRX ID */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase">
                          License Key or EasyPaisa Payment TRX ID:
                        </label>
                        {inputTxnKey.trim().length > 0 && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Chars: <strong className="text-white">{inputTxnKey.trim().length}</strong>
                          </span>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={inputTxnKey}
                          onChange={(e) => setInputTxnKey(e.target.value.toUpperCase())}
                          placeholder="e.g. M01P-A892-B910-KEY1 or EasyPaisa TRX ID"
                          className={`w-full bg-slate-950 text-amber-300 font-mono font-bold text-xs rounded-xl p-2.5 pr-10 uppercase outline-none transition-all border ${
                            !inputTxnKey.trim()
                              ? 'border-slate-700 focus:border-amber-400'
                              : inputTxnKey.trim().length >= 6
                              ? 'border-emerald-500 shadow-md shadow-emerald-950/40'
                              : 'border-rose-500/80 bg-rose-950/20'
                          }`}
                        />
                        <div className="absolute right-3 flex items-center pointer-events-none">
                          {!inputTxnKey.trim() ? (
                            <Key className="w-4 h-4 text-slate-500" />
                          ) : inputTxnKey.trim().length >= 6 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500 animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 10-Digit Admin Password Input */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold text-cyan-300 uppercase flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Mandatory 10-Digit Admin Activation Password:</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          WhatsApp: <strong className="text-amber-300 font-bold">{ADMIN_WHATSAPP}</strong>
                        </span>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={activationPassword}
                          onChange={(e) => setActivationPassword(e.target.value)}
                          placeholder="Enter 10-Digit Admin Password"
                          maxLength={20}
                          className={`w-full bg-slate-950 text-cyan-300 font-mono font-bold text-xs rounded-xl p-2.5 pr-10 outline-none transition-all border ${
                            isShaking
                              ? 'border-rose-500 ring-2 ring-rose-500/60 bg-rose-950/40 text-rose-200'
                              : !activationPassword.trim()
                              ? 'border-slate-700 focus:border-cyan-400'
                              : activationPassword.trim().length >= 10
                              ? 'border-cyan-400 shadow-md shadow-cyan-950/50'
                              : 'border-amber-500/80 bg-amber-950/20'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 p-1 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                          title={showPassword ? 'Hide Password' : 'Show Password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4 text-cyan-400" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {statusMessage && (
                      <div
                        className={`p-2.5 rounded-xl text-xs font-semibold ${
                          statusMessage.type === 'success'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : statusMessage.type === 'error'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        }`}
                      >
                        {statusMessage.text}
                      </div>
                    )}

                    {/* 3D Action Submit Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="submit"
                        disabled={isVerifying}
                        className="btn-3d-emerald py-3 px-4 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
                      >
                        {isVerifying ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Verifying & Unlocking...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-yellow-300" />
                            <span>Verify & Unlock Software</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`https://wa.me/923410781866?text=${encodeURIComponent(`Assalam-o-Alaikum! I need the 10-digit Activation Password for HWID: ${licenseData?.hwid || ''} (Plan: ${PLAN_CONFIGS[planMonths]?.label || '12 Months'})`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-3d-gold py-3 px-4 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider text-center"
                      >
                        <MessageSquare className="w-4 h-4 text-slate-950" />
                        <span>Get Password on WhatsApp</span>
                      </a>
                    </div>
                  </form>

                  {/* Offline cryptographic badge */}
                  <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 text-[11px] flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-2">
                      {isOnline ? (
                        <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span>
                        {isOnline
                          ? '100% On-Device Standalone Cryptographic Verification Ready'
                          : '⚠️ Offline Mode: Validates securely without internet via local HWID'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-amber-400">
                      AES-256 GCM
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: EASYPAISA & QR SCANNER */}
              {activationMainTab === 'qr' && (
                <div className="space-y-4">
                  {/* EasyPaisa Account Details Card */}
                  <div className="bg-gradient-to-r from-emerald-950/70 via-slate-950 to-emerald-950/70 border border-emerald-500/40 rounded-2xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-emerald-400 font-extrabold uppercase text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4" />
                        EasyPaisa Official Payment Gateway
                      </span>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px]">
                        100% Verified
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                      <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Account Number:</span>
                        <span className="font-bold text-white text-xs select-all">03365766177</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Account Title:</span>
                        <span className="font-bold text-emerald-300 text-xs">Salman Said</span>
                      </div>
                    </div>
                  </div>

                  {/* QR Subtabs Switcher */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-amber-400" />
                        <span>QR Activation & Mobile Scan Hub</span>
                      </span>
                      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setActiveQrTab('easypaisa')}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            activeQrTab === 'easypaisa' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          💳 EasyPaisa
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveQrTab('whatsapp')}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            activeQrTab === 'whatsapp' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          💬 WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveQrTab('scan')}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            activeQrTab === 'scan' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          📷 Camera QR
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveQrTab('transfer')}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            activeQrTab === 'transfer' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ⇄ Migration
                        </button>
                      </div>
                    </div>

                    {activeQrTab === 'easypaisa' && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/80 p-3 rounded-xl border border-emerald-500/30">
                        {paymentQrUrl && (
                          <div className="bg-white p-2 rounded-xl shadow-lg shrink-0 border border-emerald-400">
                            <img src={paymentQrUrl} alt="EasyPaisa Payment QR" className="w-24 h-24 object-contain" />
                          </div>
                        )}
                        <div className="space-y-1 text-xs text-slate-300">
                          <strong className="text-emerald-400 uppercase text-[10px] block">
                            EasyPaisa / JazzCash Direct QR
                          </strong>
                          <p className="text-[11px] leading-relaxed">
                            Scan with mobile banking app to send PKR <strong>{PLAN_CONFIGS[planMonths]?.pkr.toLocaleString()}</strong> ({planMonths} Month Plan) to <strong>03365766177</strong> (Salman Said).
                          </p>
                        </div>
                      </div>
                    )}

                    {activeQrTab === 'whatsapp' && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/80 p-3 rounded-xl border border-emerald-500/30">
                        {waQrUrl && (
                          <div className="bg-white p-2 rounded-xl shadow-lg shrink-0 border border-emerald-400">
                            <img src={waQrUrl} alt="WhatsApp Password QR" className="w-24 h-24 object-contain" />
                          </div>
                        )}
                        <div className="space-y-1 text-xs text-slate-300">
                          <strong className="text-emerald-400 uppercase text-[10px] block">
                            Direct WhatsApp HWID Dispatch
                          </strong>
                          <p className="text-[11px] leading-relaxed">
                            Scan with phone camera to message software author Salman Said with your pre-filled <strong>HWID ({licenseData.hwid})</strong> for instant 10-digit password delivery.
                          </p>
                        </div>
                      </div>
                    )}

                    {activeQrTab === 'scan' && (
                      <div className="space-y-2.5 bg-slate-900/80 p-3 rounded-xl border border-cyan-500/30 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5 text-cyan-400" />
                            Live Camera QR Scanner
                          </span>
                          <span className="text-[10px] text-emerald-400 font-mono">html5-qrcode</span>
                        </div>

                        <div id="html5-qr-file-reader" className="hidden" />

                        {isCameraScanning ? (
                          <div className="space-y-2">
                            <div className="relative rounded-xl overflow-hidden border-2 border-cyan-500 bg-slate-950 p-1">
                              <div id="html5-qr-reader" className="w-full max-h-[200px] overflow-hidden rounded-lg relative" />
                              <div className="absolute top-2 right-2 z-30">
                                <button
                                  type="button"
                                  onClick={() => setIsCameraScanning(false)}
                                  className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold"
                                >
                                  Stop Camera
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCameraError(null);
                                setIsCameraScanning(true);
                              }}
                              className="btn-3d-cyan flex-1 py-2 px-3 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Start Camera Scanner</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => qrFileInputRef.current?.click()}
                              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Upload className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Upload QR Image</span>
                            </button>
                            <input
                              type="file"
                              ref={qrFileInputRef}
                              onChange={handleFileUploadScan}
                              accept="image/*"
                              className="hidden"
                            />
                          </div>
                        )}

                        {cameraError && (
                          <div className="p-2 bg-rose-950/60 border border-rose-500/50 rounded-lg text-rose-300 text-[10px]">
                            {cameraError}
                          </div>
                        )}

                        {detectedQrInfo && (
                          <div className="p-2 bg-slate-950 border border-cyan-500/60 rounded-lg text-[10px] font-mono text-cyan-300">
                            <div>Detected: {detectedQrInfo.badge}</div>
                            <div className="truncate">Payload: {detectedQrInfo.raw}</div>
                          </div>
                        )}

                        <div className="pt-1">
                          <input
                            type="text"
                            value={pastedQrPayload}
                            onChange={(e) => handleParseQrPayload(e.target.value)}
                            placeholder="Or paste QR payload text / activation string here..."
                            className="w-full bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-xs p-2 rounded-xl outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>
                    )}

                    {activeQrTab === 'transfer' && (
                      <div className="space-y-2.5 bg-slate-900/80 p-3 rounded-xl border border-indigo-500/30 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider flex items-center gap-1">
                            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
                            License Migration Token Transfer
                          </span>
                          <span className="text-[10px] text-cyan-400 font-mono">HWID: {getMachineHardwareID()}</span>
                        </div>
                        <textarea
                          rows={2}
                          value={migrationTokenInput}
                          onChange={(e) => setMigrationTokenInput(e.target.value)}
                          placeholder="Paste Migration Token starting with MIGRATE-..."
                          className="w-full bg-slate-950 border border-indigo-500/50 text-indigo-300 font-mono text-xs p-2 rounded-xl outline-none focus:border-indigo-400"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleApplyMigrationToken}
                            className="btn-3d-cyan flex-1 py-2 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Apply Token & Transfer License</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const res = performActivationAutoCleanup();
                              setStatusMessage({
                                type: 'info',
                                text: `🧹 Sanitized ${res.cleanedItems.length} cache items.`
                              });
                            }}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-[11px] font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                            <span>Cleanup</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: 13 PLANS & COMPARISON MATRIX */}
              {activationMainTab === 'plans' && (
                <div className="space-y-4">
                  {/* Side-by-side Infographic Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 12-Month Plan */}
                    <div
                      onClick={() => setPlanMonths(12)}
                      className={`card-3d p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between space-y-2.5 ${
                        planMonths === 12
                          ? 'bg-gradient-to-b from-indigo-950/90 to-slate-950 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                          : 'bg-slate-950/90 border-indigo-500/30 hover:border-indigo-400/60'
                      }`}
                    >
                      <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-yellow-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                        ⭐ Recommended
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-amber-400/20 rounded-lg text-amber-400 border border-amber-400/30">
                            <Award className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white">12-Month Annual Pass</h4>
                            <span className="text-[10px] text-emerald-400 font-mono font-bold">
                              PKR 60,000 / Year <span className="text-slate-400 font-normal">(= PKR 5,000 / mo)</span>
                            </span>
                          </div>
                        </div>
                        <ul className="space-y-1 text-[11px] text-slate-200">
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span><strong>365 Days Non-Stop:</strong> 0 monthly lockout risks</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span><strong>Zero Password Hassle:</strong> 1-time setup for entire year</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span><strong>VIP 24/7 Priority Support:</strong> Fast remote AnyDesk queue</span>
                          </li>
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlanMonths(12);
                        }}
                        className={`w-full py-1.5 font-black text-xs rounded-xl transition-all cursor-pointer ${
                          planMonths === 12 ? 'btn-3d-gold text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {planMonths === 12 ? '✓ Selected (12 Months)' : 'Select 12-Month Plan'}
                      </button>
                    </div>

                    {/* 1-Month Plan */}
                    <div
                      onClick={() => setPlanMonths(1)}
                      className={`card-3d p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                        planMonths === 1
                          ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-cyan-400 ring-2 ring-cyan-400/50 shadow-lg'
                          : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-slate-800 rounded-lg text-slate-300 border border-slate-700">
                            <Clock className="w-4 h-4 text-cyan-400" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white">1-Month Starter Pass</h4>
                            <span className="text-[10px] text-cyan-300 font-mono font-bold">
                              PKR 5,000 / Month <span className="text-emerald-400 font-bold">(+2 Days Free = 32 Days)</span>
                            </span>
                          </div>
                        </div>
                        <ul className="space-y-1 text-[11px] text-slate-300">
                          <li className="flex items-center gap-1.5">
                            <span className="text-amber-400 font-bold">⏳</span>
                            <span><strong>32 Days Duration:</strong> Monthly renewal required</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <span className="text-rose-400 font-bold">⚠️</span>
                            <span><strong>12 Renewals / Year:</strong> Lockout occurs if expired</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-bold">💬</span>
                            <span><strong>Standard Queue:</strong> Normal response time</span>
                          </li>
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlanMonths(1);
                        }}
                        className={`w-full py-1.5 font-black text-xs rounded-xl transition-all cursor-pointer ${
                          planMonths === 1 ? 'btn-3d-cyan text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {planMonths === 1 ? '✓ Selected (1 Month)' : 'Select 1-Month Plan'}
                      </button>
                    </div>
                  </div>

                  {/* 3-Point Comparison Feature Matrix */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[10.5px]">
                    <div className="text-center space-y-0.5 border-r border-slate-800 pr-1">
                      <span className="text-slate-400 uppercase font-bold block text-[9.5px]">Renewal Frequency</span>
                      <div className="font-mono text-emerald-400 font-black">12-Mo: 1x / Year</div>
                      <div className="font-mono text-slate-400 text-[10px]">1-Mo: 12x / Year</div>
                    </div>
                    <div className="text-center space-y-0.5 border-r border-slate-800 pr-1">
                      <span className="text-slate-400 uppercase font-bold block text-[9.5px]">Downtime Risk</span>
                      <div className="font-mono text-emerald-400 font-black">12-Mo: 0% Downtime</div>
                      <div className="font-mono text-amber-400 text-[10px]">1-Mo: Monthly Expiry</div>
                    </div>
                    <div className="text-center space-y-0.5">
                      <span className="text-slate-400 uppercase font-bold block text-[9.5px]">Support Level</span>
                      <div className="font-mono text-amber-300 font-black">12-Mo: VIP 24/7 Priority</div>
                      <div className="font-mono text-slate-400 text-[10px]">1-Mo: Standard Queue</div>
                    </div>
                  </div>

                  {/* Full 13-Plan Quick Grid */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase block">
                      Choose from all 13 Subscription Tiers:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 text-[10.5px]">
                      {Object.values(PLAN_CONFIGS).map((cfg) => (
                        <button
                          key={cfg.planMonths}
                          type="button"
                          onClick={() => setPlanMonths(cfg.planMonths)}
                          className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                            planMonths === cfg.planMonths
                              ? 'bg-amber-950/60 border-amber-400 text-amber-300 font-bold ring-1 ring-amber-400/50'
                              : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold truncate">{cfg.label}</div>
                          <div className="font-mono text-[10px] text-emerald-400">PKR {cfg.pkr.toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DIAGNOSTICS & OWNER ADMIN (F9) */}
              {activationMainTab === 'diagnostics' && (
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <span>Hardware Fingerprint Diagnostics (HWID)</span>
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono pt-1">
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Machine HWID:</span>
                        <span className="text-amber-300 font-bold truncate block">{licenseData.hwid}</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Platform:</span>
                        <span className="text-white font-bold truncate block">{navigator.platform || 'Win32'}</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">CPU Cores:</span>
                        <span className="text-white font-bold">{navigator.hardwareConcurrency || 4} Threads</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Crypto Engine:</span>
                        <span className="text-emerald-400 font-bold">AES-256 GCM</span>
                      </div>
                    </div>
                  </div>

                  {/* Owner Admin License Panel Launcher */}
                  <div className="bg-gradient-to-r from-purple-950/50 via-slate-950 to-indigo-950/50 border border-purple-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">Owner Admin & Reseller Console</h4>
                        <p className="text-[11px] text-slate-300">
                          Password Key Generator, Reseller Multi-PC License Issue, & Commercial Unlock.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowActivationModal(false);
                        setShowAdminPanel(true);
                      }}
                      className="btn-3d-gold px-3.5 py-2 text-slate-950 font-black text-xs rounded-xl shadow-md cursor-pointer shrink-0 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                      <span>Open Admin (F9)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Fixed Sticky Footer Action Strip */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-950/95 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[11px] font-mono">Author: Salman Said • 0341-0781866</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowActivationModal(false);
                    setShowAdminPanel(true);
                  }}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  title="Owner Key Generator"
                >
                  <Key className="w-3.5 h-3.5 text-purple-400" />
                  <span>Admin Console</span>
                </button>

                {!licenseData.isExpired && (
                  <button
                    type="button"
                    onClick={() => setShowActivationModal(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-PC FLEET AUTO-UPDATES & VERSION MANAGEMENT MODAL */}
      {showVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/50 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-950/60">
                  <Radio className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>Software Version Updates & Fleet Sync</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                      {currentInstalledVersion}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time multi-PC auto-synchronization with Owner Master Laptop
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVersionModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Installed Version</span>
                <p className="text-sm font-mono font-black text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{currentInstalledVersion}</span>
                </p>
                <span className="text-[10px] text-slate-400">Offline & Standalone Ready</span>
              </div>
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Fleet Channel</span>
                <p className="text-sm font-mono font-black text-cyan-300 flex items-center gap-1.5">
                  <Wifi className="w-4 h-4 text-cyan-400" />
                  <span>Multi-PC Sync Active</span>
                </p>
                <span className="text-[10px] text-slate-400">Owner Broadcast Channel</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">Check for Newer Release</h4>
                  <p className="text-[11px] text-slate-400">Poll the local network and broadcast listener for updates</p>
                </div>
                <button
                  type="button"
                  onClick={handleManualCheckForUpdates}
                  disabled={isCheckingForUpdates}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isCheckingForUpdates ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isCheckingForUpdates ? 'Checking...' : 'Check Updates Now'}</span>
                </button>
              </div>

              {incomingMasterUpdate && (
                <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-xs text-emerald-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <strong>New Update Available: {incomingMasterUpdate.version}</strong>
                    <p className="text-[11px] text-emerald-300/80">{incomingMasterUpdate.changelog || 'Latest security and feature improvements'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      applyMasterSoftwareUpdate(incomingMasterUpdate);
                      setShowAutoUpdateToast(false);
                      setShowVersionModal(false);
                      location.reload();
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow"
                  >
                    Apply & Reload
                  </button>
                </div>
              )}
            </div>

            {/* Release Notes */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">System Release Highlights</h4>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1.5 leading-relaxed">
                <p>• <strong>Owner Admin Panel:</strong> Integrated Key Generator, WhatsApp dispatch, and PIN manager.</p>
                <p>• <strong>System Settings Security:</strong> Zero default password with custom admin password setup gate.</p>
                <p>• <strong>Laptop Screen Fit:</strong> 1-Click UI density switcher (100%, 90%, 80%) for 1366x768 & small screens.</p>
                <p>• <strong>Multi-PC Fleet Sync:</strong> Instant database sync across pharmacy counter laptops.</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowVersionModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OWNER ADMIN KEY GENERATOR & PASSWORD MANAGEMENT PANEL */}
      <AdminLicensePanel
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
      />

      {/* SYSTEM SETTINGS MASTER PASSWORD AUTHENTICATION MODAL */}
      <SettingsPasswordModal
        isOpen={showSettingsAuthModal}
        onClose={() => {
          setShowSettingsAuthModal(false);
          setSettingsAuthSuccessCb(null);
        }}
        onSuccess={() => {
          setShowSettingsAuthModal(false);
          if (settingsAuthSuccessCb) {
            const cb = settingsAuthSuccessCb;
            setSettingsAuthSuccessCb(null);
            cb();
          } else if ((window as any).app) {
            (window as any).app.switchModule('settings');
          }
        }}
      />
    </div>
  );
}
