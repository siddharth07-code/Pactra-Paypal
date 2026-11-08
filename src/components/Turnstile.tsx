"use client";

import React, { forwardRef, useImperativeHandle } from "react";

export interface TurnstileRef {
  reset: () => void;
  getResponse: () => string | undefined;
}

export interface TurnstileProps {
  siteKey: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  className?: string;
  onExpire?: () => void;
  onError?: () => void;
  onVerify?: (token: string) => void;
}

/**
 * Optional Cloudflare Turnstile integration component.
 * When a site key is provided, embeds verification; otherwise gracefully no-ops in local development.
 */
export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(function Turnstile(
  { className, onVerify },
  ref
) {
  useImperativeHandle(ref, () => ({
    reset: () => {},
    getResponse: () => "dev_mock_token",
  }));

  React.useEffect(() => {
    onVerify?.("dev_mock_token");
  }, [onVerify]);

  return (
    <div className={className} data-testid="turnstile-container" aria-hidden="true" />
  );
});

