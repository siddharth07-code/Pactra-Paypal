'use client';

import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { User, Mail, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { Turnstile, type TurnstileRef } from './Turnstile';

// Register the hook to ensure proper cleanup in React strict mode
gsap.registerPlugin(useGSAP);

export interface AnimatedAuthProps {
  initialMode?: 'login' | 'signup';
  themeColor?: string;
  themeColorDark?: string;
  backgroundColor?: string;
  backgroundColorDark?: string;
  backdrop?: string;
  backdropDark?: string;
  placeholderColor?: string;
  placeholderColorDark?: string;
  textColor?: string;
  textColorDark?: string;
  secondaryTextColor?: string;
  secondaryTextColorDark?: string;
  borderColor?: string;
  borderColorDark?: string;
  transitionTintColor?: string;
  transitionTintColorDark?: string;
  leftPanelTitle?: string;
  leftPanelSubtitle?: string;
  rightPanelTitle?: string;
  rightPanelSubtitle?: string;
  leftPanelTitleColor?: string;
  leftPanelSubtitleColor?: string;
  rightPanelTitleColor?: string;
  rightPanelSubtitleColor?: string;
  loginTitle?: string;
  signupTitle?: string;
  leftPanelImage?: string;
  rightPanelImage?: string;
  redirectTo?: string;
}

export const ANIMATED_AUTH_TRANSITION_TINT_COLOR = '#B83E26';

export const AUTH_COLORS_LIGHT = {
  themeColor: '#B83E26',
  backgroundColor: '#FFFFFF',
  backdrop: '#F7F5F0',
  placeholderColor: '#8E8A82',
  textColor: '#171717',
  secondaryTextColor: '#625F57',
  borderColor: '#DCD8CE',
  transitionTintColor: '#EFECE5',
  /* dark-mode fallbacks */
  themeColorDark: '#B83E26',
  backgroundColorDark: '#1D1D1A',
  backdropDark: '#151513',
  placeholderColorDark: '#737373',
  textColorDark: '#F2EFE7',
  secondaryTextColorDark: '#B7B2A7',
  borderColorDark: '#3B3A34',
  transitionTintColorDark: '#262622',
};

export const AUTH_COLORS_DARK = {
  themeColor: '#B83E26',
  backgroundColor: '#1D1D1A',
  backdrop: '#151513',
  placeholderColor: '#737373',
  textColor: '#F2EFE7',
  secondaryTextColor: '#B7B2A7',
  borderColor: '#3B3A34',
  transitionTintColor: '#262622',
  /* light-mode fallbacks */
  themeColorDark: '#B83E26',
  backgroundColorDark: '#1D1D1A',
  backdropDark: '#151513',
  placeholderColorDark: '#737373',
  textColorDark: '#F2EFE7',
  secondaryTextColorDark: '#B7B2A7',
  borderColorDark: '#3B3A34',
  transitionTintColorDark: '#262622',
};

export default function AnimatedAuth({
  initialMode = 'login',
  themeColor = AUTH_COLORS_LIGHT.themeColor,
  themeColorDark = AUTH_COLORS_DARK.themeColor,
  backgroundColor = AUTH_COLORS_LIGHT.backgroundColor,
  backgroundColorDark = AUTH_COLORS_DARK.backgroundColor,
  backdrop = AUTH_COLORS_LIGHT.backdrop,
  backdropDark = AUTH_COLORS_DARK.backdrop,
  placeholderColor = AUTH_COLORS_LIGHT.placeholderColor,
  placeholderColorDark = AUTH_COLORS_DARK.placeholderColor,
  textColor = AUTH_COLORS_LIGHT.textColor,
  textColorDark = AUTH_COLORS_DARK.textColor,
  secondaryTextColor = AUTH_COLORS_LIGHT.secondaryTextColor,
  secondaryTextColorDark = AUTH_COLORS_DARK.secondaryTextColor,
  borderColor = AUTH_COLORS_LIGHT.borderColor,
  borderColorDark = AUTH_COLORS_DARK.borderColor,
  transitionTintColor = AUTH_COLORS_LIGHT.transitionTintColor,
  transitionTintColorDark = AUTH_COLORS_DARK.transitionTintColor,
  leftPanelTitle = 'INSTITUTIONAL ACCESS',
  leftPanelSubtitle = "Access your organization's autonomous procurement mandates, vendor negotiations, and payment audit certificates.",
  rightPanelTitle = 'ENTERPRISE PROCUREMENT',
  rightPanelSubtitle = 'Autonomous B2B negotiation, cryptographic Merkle audit trails, and audited PayPal settlement.',
  leftPanelTitleColor = '#ffffff',
  leftPanelSubtitleColor = 'rgba(255, 255, 255, 0.85)',
  rightPanelTitleColor = '#ffffff',
  rightPanelSubtitleColor = 'rgba(255, 255, 255, 0.85)',
  loginTitle = 'Login',
  signupTitle = 'Sign Up',
  leftPanelImage = '/Authsideimage.jpeg',
  rightPanelImage = '/Authsideimage.jpeg',
  redirectTo,
}: AnimatedAuthProps) {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const preload = (src?: string) => {
      if (!src) return;
      const img = new Image();
      img.src = src;
    };
    preload(leftPanelImage);
    preload(rightPanelImage);
  }, [leftPanelImage, rightPanelImage]);

  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupPhone, setSignupPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayTintRef = useRef<HTMLDivElement>(null);
  const leftBgRef = useRef<HTMLDivElement>(null);
  const rightBgRef = useRef<HTMLDivElement>(null);
  const overlayLeftTextRef = useRef<HTMLDivElement>(null);
  const overlayRightTextRef = useRef<HTMLDivElement>(null);
  const loginFormRef = useRef<HTMLDivElement>(null);
  const signupFormRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileRef>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';
  const isTurnstileConfigured = turnstileSiteKey.length > 0;

  const isDark = theme === 'dark' || (theme === 'system' && resolvedTheme === 'dark');
  const activeThemeColor = isDark ? themeColorDark : themeColor;
  const activeBackgroundColor = isDark ? backgroundColorDark : backgroundColor;
  const activeBackdrop = isDark ? backdropDark : backdrop;
  const activePlaceholderColor = isDark ? placeholderColorDark : placeholderColor;
  const activeTextColor = isDark ? textColorDark : textColor;
  const activeSecondaryTextColor = isDark ? secondaryTextColorDark : secondaryTextColor;
  const activeBorderColor = isDark ? borderColorDark : borderColor;
  const activeTransitionTintColor = isDark ? transitionTintColorDark : transitionTintColor;

  useGSAP(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    gsap.fromTo(
      containerRef.current,
      { autoAlpha: 0, y: prefersReducedMotion ? 0 : 32, scale: prefersReducedMotion ? 1 : 0.98 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: prefersReducedMotion ? 0.01 : 0.75,
        ease: 'power3.out',
      }
    );
  }, { scope: containerRef });

  useGSAP(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0.01 : 0.8;

    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', duration } });

    if (isLogin) {
      // Transition to Login State (Overlay moves right)
      tl.to(overlayTintRef.current, { autoAlpha: 1, duration: prefersReducedMotion ? 0.01 : 0.25, ease: 'power1.out' }, 0);
      tl.to(overlayRef.current, {
        left: '45%',
        clipPath: 'polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%)',
      }, 0)
        .to(overlayTintRef.current, { autoAlpha: 0, duration: prefersReducedMotion ? 0.01 : 0.35, ease: 'power1.in' }, 0.55)
        .to(overlayLeftTextRef.current, { autoAlpha: 0, x: -50 }, 0)
        .to(overlayRightTextRef.current, { autoAlpha: 1, x: 0 }, 0.2)
        .to(leftBgRef.current, { autoAlpha: 0 }, 0)
        .to(rightBgRef.current, { autoAlpha: 1 }, 0)
        .to(signupFormRef.current, { autoAlpha: 0, x: 50 }, 0)
        .to(loginFormRef.current, { autoAlpha: 1, x: 0 }, 0.2);
    } else {
      // Transition to Sign Up State (Overlay moves left)
      tl.to(overlayTintRef.current, { autoAlpha: 1, duration: prefersReducedMotion ? 0.01 : 0.25, ease: 'power1.out' }, 0);
      tl.to(overlayRef.current, {
        left: '0%',
        clipPath: 'polygon(0% 0%, 100% 0%, 80% 100%, 0% 100%)',
      }, 0)
        .to(overlayTintRef.current, { autoAlpha: 0, duration: prefersReducedMotion ? 0.01 : 0.35, ease: 'power1.in' }, 0.55)
        .to(overlayRightTextRef.current, { autoAlpha: 0, x: 50 }, 0)
        .to(overlayLeftTextRef.current, { autoAlpha: 1, x: 0 }, 0.2)
        .to(rightBgRef.current, { autoAlpha: 0 }, 0)
        .to(leftBgRef.current, { autoAlpha: 1 }, 0)
        .to(loginFormRef.current, { autoAlpha: 0, x: -50 }, 0)
        .to(signupFormRef.current, { autoAlpha: 1, x: 0 }, 0.2);
    }
  }, { dependencies: [isLogin], scope: containerRef });

  const handleLogin = async () => {
    setError('');
    setMessage('');

    if (isTurnstileConfigured) {
      let token = turnstileRef.current?.getResponse();
      if (!token) {
        if (process.env.NODE_ENV === 'development') {
          token = 'dev_mock_token';
        } else {
          setError('Please complete the Turnstile verification.');
          return;
        }
      }

      try {
        const verifyRes = await fetch('/api/verify-turnstile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
          const message =
            typeof verifyData.message === 'string' && verifyData.message.trim().length > 0
              ? verifyData.message
              : 'Turnstile verification failed. Please try again.';
          setError(message);
          turnstileRef.current?.reset();
          return;
        }
      } catch {
        // If verify endpoint is unavailable in development, continue
      }
    }

    if (!loginEmail.trim() || !loginPassword) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Authentication failed. Check your credentials or sign in again.');
        setLoading(false);
        turnstileRef.current?.reset();
        return;
      }

      setLoading(false);
      const destination = redirectTo || data.redirectTo || '/account';
      if (typeof window !== 'undefined') {
        window.location.assign(destination);
      } else {
        router.push(destination);
      }
    } catch {
      setError('Authentication is unavailable. Please retry.');
      setLoading(false);
      turnstileRef.current?.reset();
    }
  };

  const handleSignup = async () => {
    if (!signupEmail.trim() || !signupPassword) {
      setError('Email and password are required.');
      return;
    }

    if (signupPassword.length < 12) {
      setError('Password must be between 12 and 128 characters.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail.trim(),
          password: signupPassword,
          name: signupName.trim() || undefined,
          phone: signupPhone.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Registration could not be completed with these details.');
        setLoading(false);
        return;
      }

      setLoading(false);
      setMessage(data.message || 'Check your email to confirm registration if this address is eligible.');
      setIsLogin(true);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/login');
      }
    } catch {
      setError('Registration is unavailable. Please retry.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail.trim()) {
      setError('Please enter your email address first.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/recovery', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Password reset is currently unavailable.');
      setMessage('Check your email for a reset link if this address is eligible. Open it in this browser.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password reset is currently unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen p-4 bg-cover bg-center"
      style={{
        background: activeBackdrop,
        backgroundImage: isDark
          ? 'radial-gradient(circle at 10% 20%, rgba(32, 32, 32, 0.6) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(42, 30, 59, 0.4) 0%, transparent 40%)'
          : 'radial-gradient(circle at 10% 20%, rgba(246, 243, 238, 0.8) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(246, 241, 254, 0.6) 0%, transparent 40%)',
      }}
    >
      {/* Main Container */}
      <div
        ref={containerRef}
        className="relative w-full max-w-4xl h-[600px] md:h-[520px] rounded-2xl overflow-hidden flex"
        style={{
          backgroundColor: activeBackgroundColor,
          boxShadow: isDark
            ? `0 24px 60px rgba(0, 0, 0, 0.6), inset 0 0 0 1px ${activeBorderColor}`
            : `0 24px 60px -8px rgba(23, 23, 23, 0.08), 0 4px 16px rgba(23, 23, 23, 0.03), inset 0 0 0 1px ${activeBorderColor}`,
          '--auth-placeholder': activePlaceholderColor,
          '--auth-text': activeTextColor,
          '--auth-text-secondary': activeSecondaryTextColor,
          '--auth-border': activeBorderColor,
        } as React.CSSProperties}
      >
        {(error || message) && (
          <div
            role={error ? 'alert' : 'status'}
            className="absolute left-1/2 top-4 z-30 -translate-x-1/2 px-4 py-2 text-sm rounded-lg border border-white/20 bg-black/75 text-white shadow-lg backdrop-blur-sm"
          >
            {error || message}
          </div>
        )}

        {/* === LOGIN FORM (Left Side) === */}
        <div
          ref={loginFormRef}
          className="absolute left-0 top-0 w-full md:w-1/2 h-full flex flex-col justify-center px-8 md:px-12 opacity-0 -translate-x-12 pointer-events-auto z-10"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-[var(--auth-text)] mb-8">{loginTitle}</h2>
          <div className="space-y-5">
            <div className="relative border-b border-[var(--auth-border)] pb-2 transition-colors focus-within:border-[#B83E26]">
              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)] font-sans"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)] pointer-events-none">
                <Mail size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2 transition-colors focus-within:border-[#B83E26]">
              <input
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Password"
                aria-label="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)] font-sans"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((prev) => !prev)}
                className="absolute right-0 text-xs text-[var(--auth-text-secondary)] hover:text-[var(--auth-text)] font-medium"
              >
                {showLoginPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="relative text-xs transition-colors font-medium"
                style={{ color: activeThemeColor }}
                onMouseEnter={(e) => {
                  const underline = e.currentTarget.querySelector('.forgot-underline');
                  if (underline) gsap.to(underline, { scaleX: 1, duration: 0.25, ease: 'power2.out' });
                }}
                onMouseLeave={(e) => {
                  const underline = e.currentTarget.querySelector('.forgot-underline');
                  if (underline) gsap.to(underline, { scaleX: 0, duration: 0.25, ease: 'power2.in' });
                }}
              >
                Forgot Password?
                <span
                  className="forgot-underline absolute left-0 bottom-0 w-full h-[1px] origin-left"
                  style={{ backgroundColor: activeThemeColor, transform: 'scaleX(0)' }}
                />
              </button>
            </div>
          </div>

          {isTurnstileConfigured && (
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              theme={isDark ? 'dark' : 'light'}
              size="normal"
              className="mt-4"
              onExpire={() => {
                setError('Turnstile session expired. Please verify again.');
              }}
              onError={() => {
                console.warn(
                  'Turnstile widget error. The site key may be restricted by domain (e.g., localhost is not whitelisted).'
                );
                if (process.env.NODE_ENV !== 'development') {
                  setError('Turnstile failed to load. Please try again later.');
                }
              }}
              onVerify={() => {
                setError(null);
              }}
            />
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-6 py-3 rounded-full text-white font-medium text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            style={{ backgroundColor: activeThemeColor }}
          >
            {loading ? 'Please wait...' : loginTitle}
          </button>

          <p className="text-xs text-[var(--auth-text-secondary)] mt-6 text-center">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                if (typeof window !== 'undefined') {
                  window.history.replaceState(null, '', '/signup');
                }
              }}
              style={{ color: activeThemeColor }}
              className="hover:underline font-medium"
            >
              Sign Up
            </button>
          </p>
        </div>

        {/* === SIGN UP FORM (Right Side) === */}
        <div
          ref={signupFormRef}
          className="absolute right-0 top-0 w-full md:w-1/2 h-full flex flex-col justify-center px-8 md:px-12 pointer-events-auto z-10"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--auth-text)] mb-6">{signupTitle}</h2>
          <div className="space-y-4">
            <div className="relative border-b border-[var(--auth-border)] pb-2 transition-colors focus-within:border-[#B83E26]">
              <input
                type="text"
                placeholder="Full name"
                aria-label="Full name"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)] font-sans"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)] pointer-events-none">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2 transition-colors focus-within:border-[#B83E26]">
              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)] font-sans"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)] pointer-events-none">
                <Mail size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2 transition-colors focus-within:border-[#B83E26]">
              <input
                type="text"
                placeholder="Phone"
                aria-label="Phone"
                value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)] font-sans"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)] pointer-events-none">
                <Phone size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2 transition-colors focus-within:border-[#B83E26]">
              <input
                type={showSignupPassword ? 'text' : 'password'}
                placeholder="Password"
                aria-label="Password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)] font-sans"
              />
              <button
                type="button"
                onClick={() => setShowSignupPassword((prev) => !prev)}
                className="absolute right-0 text-xs text-[var(--auth-text-secondary)] hover:text-[var(--auth-text)] font-medium"
              >
                {showSignupPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full mt-6 py-3 rounded-full text-white font-medium text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            style={{ backgroundColor: activeThemeColor }}
          >
            {loading ? 'Please wait...' : signupTitle}
          </button>

          <p className="text-xs text-[var(--auth-text-secondary)] mt-5 text-center">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                if (typeof window !== 'undefined') {
                  window.history.replaceState(null, '', '/login');
                }
              }}
              style={{ color: activeThemeColor }}
              className="hover:underline font-medium"
            >
              Login
            </button>
          </p>
        </div>

        {/* === ANIMATED OVERLAY (Sliding Panel Preserved) === */}
        <div
          ref={overlayRef}
          className="absolute top-0 h-full w-[55%] z-20 hidden md:flex overflow-hidden shadow-2xl"
          style={{
            left: initialMode === 'signup' ? '0%' : '45%',
            clipPath: initialMode === 'signup'
              ? 'polygon(0% 0%, 100% 0%, 80% 100%, 0% 100%)'
              : 'polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%)',
          }}
        >
          <div
            ref={leftBgRef}
            className="absolute inset-0 bg-cover bg-center z-0"
            style={{ backgroundImage: `url('${leftPanelImage}')` }}
          />
          <div
            ref={rightBgRef}
            className="absolute inset-0 bg-cover bg-center z-0 opacity-0 invisible"
            style={{ backgroundImage: `url('${rightPanelImage}')` }}
          />
          {/* Subtle Vignette for Accessible Text Contrast */}
          <div className="absolute inset-0 z-[5] bg-gradient-to-b from-black/55 via-black/45 to-black/70 pointer-events-none" />

          <div
            ref={overlayTintRef}
            className="absolute inset-0 opacity-0 z-10"
            style={{ backgroundColor: activeTransitionTintColor }}
          />

          {/* Overlay Content Left (Visible when overlay is on the left) */}
          <div
            ref={overlayLeftTextRef}
            className="absolute inset-0 z-20 flex flex-col justify-between pt-10 pb-10 items-start px-12 w-[calc(100%/0.55*0.5)]"
          >
            <h1
              className="text-3xl font-bold leading-tight tracking-tight"
              style={{ color: leftPanelTitleColor }}
            >
              {leftPanelTitle}
            </h1>
            <p
              className="text-sm max-w-[280px] leading-relaxed mt-3"
              style={{ color: leftPanelSubtitleColor }}
            >
              {leftPanelSubtitle}
            </p>
          </div>

          {/* Overlay Content Right (Visible when overlay is on the right) */}
          <div
            ref={overlayRightTextRef}
            className="absolute right-0 inset-y-0 z-20 flex flex-col justify-between pt-10 pb-10 items-end px-12 w-[calc(100%/0.55*0.5)] text-right opacity-0"
          >
            <h1
              className="text-3xl font-bold leading-tight tracking-tight"
              style={{ color: rightPanelTitleColor }}
            >
              {rightPanelTitle}
            </h1>
            <p
              className="text-sm max-w-[280px] leading-relaxed mt-3"
              style={{ color: rightPanelSubtitleColor }}
            >
              {rightPanelSubtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
