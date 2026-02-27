import React, { memo, useMemo } from "react";
import { PIPELINE_UI } from "../../../assets/configurations/constants";
import { FlowParticle } from "./styles";

/**
 * Animated particles flowing through the pipeline channel.
 * Uses deterministic pseudo-random values for stable rendering.
 */
export const FlowParticles = memo(() => {
  const particles = useMemo(() => {
    return Array.from({ length: PIPELINE_UI.FLOW_PARTICLE_COUNT }).map(
      (_, i) => {
        const size = 3 + (((i * 7 + 3) % 11) / 11) * 4;
        const xOffset =
          8 + (((i * 13 + 5) % 17) / 17) * (PIPELINE_UI.CHANNEL_WIDTH_PX - 16);
        const duration = 3 + (((i * 11 + 7) % 13) / 13) * 2.5;
        const delay = i * (duration / PIPELINE_UI.FLOW_PARTICLE_COUNT);
        return { size, xOffset, duration, delay };
      }
    );
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: PIPELINE_UI.CHANNEL_WIDTH_PX,
        height: "100%",
        overflow: "hidden",
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {particles.map((p, i) => (
        <FlowParticle
          key={i}
          $size={p.size}
          $xOffset={p.xOffset}
          $duration={p.duration}
          $delay={p.delay}
        />
      ))}
    </div>
  );
});

FlowParticles.displayName = "FlowParticles";
