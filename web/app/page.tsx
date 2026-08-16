"use client";

import { useCallback, useState } from "react";
import {
  parseStaad,
  registerParsingCommands,
  type ParseResult,
} from "@staad-online/parser";
import styles from "./page.module.css";

registerParsingCommands();

interface Stats {
  nodes: number;
  members: number;
  sections: number;
  supports: number;
  loadCases: number;
  groups: number;
  units: string;
  bounds: string;
}

export default function Home() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [warnings, setWarnings] = useState<ParseResult["warnings"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const parseFile = useCallback(async (file: File) => {
    setError(null);
    setStats(null);
    setWarnings(null);
    if (!file.name.toLowerCase().endsWith(".std")) {
      setError("Please choose a .std file (a STAAD input deck).");
      return;
    }
    try {
      const text = await file.text();
      const result = parseStaad(text);
      const { model } = result;
      const b = model.bounds;
      setFileName(file.name);
      setStats({
        nodes: model.nodes.length,
        members: model.members.length,
        sections: model.sections.size,
        supports: model.supports.length,
        loadCases: model.loadCases.length,
        groups: model.groups.size,
        units: `${model.units.length} / ${model.units.force}`,
        bounds: `X ${b.min[0].toFixed(2)}..${b.max[0].toFixed(2)}  Y ${b.min[1].toFixed(2)}..${b.max[1].toFixed(2)}  Z ${b.min[2].toFixed(2)}..${b.max[2].toFixed(2)}`,
      });
      setWarnings(result.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void parseFile(file);
    },
    [parseFile],
  );

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>STAAD Online</h1>
        <p className={styles.subtitle}>
          Upload a STAAD <code>.std</code> file — parsed entirely in your
          browser, nothing is uploaded anywhere.
        </p>

        <div
          className={`${styles.dropzone} ${dragOver ? styles.dragover : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <label className={styles.fileLabel}>
            <span>{fileName ?? "Drop a .std file here, or click to browse"}</span>
            <input
              type="file"
              accept=".std"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void parseFile(file);
              }}
            />
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {stats && (
          <section className={styles.results}>
            <h2>Model summary</h2>
            <div className={styles.grid}>
              <div className={styles.card}>
                <span className={styles.cardValue}>{stats.nodes}</span>
                <span className={styles.cardLabel}>Joints</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardValue}>{stats.members}</span>
                <span className={styles.cardLabel}>Members</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardValue}>{stats.sections}</span>
                <span className={styles.cardLabel}>Sections</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardValue}>{stats.supports}</span>
                <span className={styles.cardLabel}>Supports</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardValue}>{stats.loadCases}</span>
                <span className={styles.cardLabel}>Load cases</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardValue}>{stats.groups}</span>
                <span className={styles.cardLabel}>Groups</span>
              </div>
            </div>
            <dl className={styles.details}>
              <div>
                <dt>Units</dt>
                <dd>{stats.units}</dd>
              </div>
              <div>
                <dt>Bounds</dt>
                <dd>{stats.bounds}</dd>
              </div>
            </dl>
          </section>
        )}

        {warnings && warnings.length > 0 && (
          <section className={styles.warnings}>
            <h2>Warnings ({warnings.length})</h2>
            <ul>
              {warnings.slice(0, 20).map((w, i) => (
                <li key={i}>
                  <code>{w.code}</code> line {w.line} — {w.message}
                </li>
              ))}
              {warnings.length > 20 && <li>… and {warnings.length - 20} more</li>}
            </ul>
          </section>
        )}

        {stats && warnings && warnings.length === 0 && (
          <p className={styles.clean}>Clean parse — no warnings.</p>
        )}
      </main>
    </div>
  );
}
