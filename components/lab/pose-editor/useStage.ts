"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseStageApi, StageLayout, StageMessage, StageQuality, StageRings } from "./stageApi";

export interface StageHandle {
  ready: boolean;
  api: PoseStageApi | null;
  layout: StageLayout | null;
  rings: StageRings | null;
  /** re-measure the layout now */
  measure: () => void;
  /** bump to re-read the rings (after a pose push) */
  ringsVersion: number;
  setIframe: (el: HTMLIFrameElement | null) => void;
  quality: StageQuality;
  setQuality: (q: StageQuality) => void;
  idle: boolean;
  setIdle: (on: boolean) => void;
}

/**
 * Talks to the stage iframe: waits for `ready`, mirrors its layout (re-measured
 * on resize / font load) and its rendered rings.
 */
export function useStage(): StageHandle {
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const [api, setApi] = useState<PoseStageApi | null>(null);
  const [layout, setLayout] = useState<StageLayout | null>(null);
  const [rings, setRings] = useState<StageRings | null>(null);
  const [ringsVersion, setRingsVersion] = useState(0);
  const [quality, setQualityState] = useState<StageQuality>("medium");
  const [idle, setIdleState] = useState(false);
  const apiRef = useRef<PoseStageApi | null>(null);

  const measure = useCallback(() => {
    const a = apiRef.current;
    if (!a) return;
    try {
      setLayout(a.layout());
    } catch {
      /* stage is reloading */
    }
  }, []);

  const readRings = useCallback(() => {
    const a = apiRef.current;
    if (!a) return;
    try {
      setRings(a.rings());
      setRingsVersion((v) => v + 1);
    } catch {
      /* stage is reloading */
    }
  }, []);

  const attach = useCallback(() => {
    const w = iframe.current?.contentWindow;
    const a = w?.__poseStage ?? null;
    apiRef.current = a;
    setApi(a);
    if (a) {
      measure();
      readRings();
    }
  }, [measure, readRings]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data as StageMessage | undefined;
      if (!m || m.source !== "pose-stage" || ev.source !== iframe.current?.contentWindow) return;
      if (m.type === "ready") attach();
      else if (m.type === "layout") measure();
      else if (m.type === "rings") readRings();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [attach, measure, readRings]);

  // the ready message can fire before the listener exists (HMR, slow mount): poll too
  useEffect(() => {
    if (api) return;
    const t = window.setInterval(() => {
      if (iframe.current?.contentWindow?.__poseStage) attach();
    }, 250);
    return () => window.clearInterval(t);
  }, [api, attach]);

  const setIframe = useCallback((el: HTMLIFrameElement | null) => {
    iframe.current = el;
  }, []);

  const setQuality = useCallback((q: StageQuality) => {
    setQualityState(q);
    apiRef.current?.setQuality(q);
  }, []);
  const setIdle = useCallback((on: boolean) => {
    setIdleState(on);
    apiRef.current?.setIdle(on);
  }, []);

  // keep quality / idle across stage reloads
  useEffect(() => {
    if (!api) return;
    api.setQuality(quality);
    api.setIdle(idle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return {
    ready: !!api,
    api,
    layout,
    rings,
    measure,
    ringsVersion,
    setIframe,
    quality,
    setQuality,
    idle,
    setIdle,
  };
}
