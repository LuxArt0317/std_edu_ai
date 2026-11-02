/* Video compositions register through registerRoot, without a Fast Refresh export. */
/* oxlint-disable react/only-export-components */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Composition,
  Easing,
  Freeze,
  OffthreadVideo,
  Sequence,
  getInputProps,
  interpolate,
  registerRoot,
  staticFile,
  useCurrentFrame,
} from "remotion";
const C = {
  ink: "#15382e",
  muted: "#536c60",
  paper: "#f5f7f2",
  line: "#d3e1d8",
  accent: "#14765e",
  mint: "#a8deca",
  white: "#ffffff",
};
const roles: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  president: "President",
  vice_president: "Vice president",
  dean: "Dean",
  registrar: "Registrar",
  department_head: "Department head",
  faculty: "Teacher",
  advisor: "Advisor",
  admissions: "Admissions",
  finance: "Finance",
  support: "Student support",
  librarian: "Librarian",
  student: "Student",
};
const fade = (f: number) =>
  interpolate(f, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
function Logo() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontWeight: 800,
        fontSize: 18,
        letterSpacing: 1.1,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          border: "1px solid " + C.line,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          color: C.accent,
          fontSize: 22,
        }}
      >
        樹
      </div>
      STU NEXUS
    </div>
  );
}
function Captions({ scene }: { scene: any }) {
  const f = useCurrentFrame(),
    t = f / 30;
  const cue = scene.captions.find((x: any) => t >= x.start && t < x.end);
  return cue ? (
    <div
      style={{
        position: "absolute",
        left: scene.kind === "graphic" ? 80 : 310,
        right: scene.kind === "graphic" ? 80 : 46,
        bottom: 14,
        display: "flex",
        justifyContent: "center",
        zIndex: 20,
      }}
    >
      <div
        style={{
          background: C.ink,
          color: "white",
          padding: "9px 22px",
          borderRadius: 7,
          fontSize: 28,
          lineHeight: 1.24,
          maxWidth: 1510,
          textAlign: "center",
          boxShadow: "0 2px 8px #10251a18",
        }}
      >
        {cue.text}
      </div>
    </div>
  ) : null;
}
function Graphic({ scene, episode }: { scene: any; episode: any }) {
  const f = useCurrentFrame();
  const steps = scene.steps,
    active = Math.min(
      steps.length - 1,
      Math.floor(f / (scene.frames / steps.length)),
    );
  const enter = interpolate(f, [0, 22], [24, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const roleMap = scene.id === "pitch-roles";
  return (
    <AbsoluteFill
      style={{ background: C.ink, color: C.paper, padding: "48px 80px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Logo />
        <div style={{ fontSize: 19, color: C.mint }}>
          A practical guide · {episode.audience}
        </div>
      </div>
      <div
        style={{
          marginTop: 96,
          opacity: fade(f),
          transform: `translateY(${enter}px)`,
        }}
      >
        <div
          style={{
            fontSize: 19,
            color: C.mint,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          STU Nexus / {episode.number.toString().padStart(2, "0")}
        </div>
        <h1
          style={{
            fontSize: 78,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: -2,
            margin: "22px 0 28px",
            maxWidth: 1500,
          }}
        >
          {scene.title}
        </h1>
        <div style={{ fontSize: 26, color: "#bed2c6" }}>
          Real workflows. Clear next steps. Human-reviewed AI.
        </div>
      </div>
      {roleMap ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 22,
            marginTop: 72,
          }}
        >
          {[
            ["Learning", ["Teacher", "Student"]],
            ["Academics", ["Registrar", "Department head", "Dean"]],
            [
              "Student services",
              ["Advisor", "Admissions", "Finance", "Support"],
            ],
            [
              "Leadership & knowledge",
              [
                "Owner",
                "Administrator",
                "President",
                "Vice president",
                "Librarian",
              ],
            ],
          ].map(([label, items]: any, i: number) => (
            <div
              key={label}
              style={{
                border: "1px solid #547367",
                borderRadius: 14,
                padding: 24,
                background: i === active ? "#214c3d" : "#183e32",
                opacity: fade(f - i * 5),
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  color: C.mint,
                  fontWeight: 600,
                  marginBottom: 18,
                }}
              >
                {label}
              </div>
              {items.map((x: string) => (
                <div key={x} style={{ fontSize: 25, marginTop: 12 }}>
                  {x}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 18,
            marginTop: 100,
          }}
        >
          {steps.map((step: string, i: number) => (
            <React.Fragment key={step}>
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  padding: "32px 24px",
                  minHeight: 178,
                  borderRadius: 14,
                  border: "1px solid " + (i <= active ? C.mint : "#506e61"),
                  background: i === active ? C.paper : "#1b4436",
                  color: i === active ? C.ink : C.paper,
                  opacity: fade(f - i * 7),
                  transform: `translateY(${interpolate(f - i * 7, [0, 18], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
                }}
              >
                <div
                  style={{
                    fontSize: 17,
                    letterSpacing: 2,
                    color: i === active ? C.accent : C.mint,
                    marginBottom: 28,
                  }}
                >
                  {(i + 1).toString().padStart(2, "0")}
                </div>
                <div style={{ fontSize: 31, lineHeight: 1.2, fontWeight: 600 }}>
                  {step}
                </div>
              </div>
              {i < steps.length - 1 ? (
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    fontSize: 30,
                    color: C.mint,
                  }}
                >
                  →
                </div>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 102,
          display: "flex",
          justifyContent: "space-between",
          color: C.mint,
          fontSize: 17,
        }}
      >
        <span>Demonstration accounts and synthetic records</span>
        <span>stdeduai.vercel.app</span>
      </div>
      <Captions scene={scene} />
    </AbsoluteFill>
  );
}
function Demo({ scene, episode }: { scene: any; episode: any }) {
  const f = useCurrentFrame();
  const clip = scene.capture;
  const mediaFrames = Math.max(1, Math.floor(clip.duration * 30) - 2),
    rate = Math.max(0.7, mediaFrames / Math.max(1, scene.frames - 30)),
    videoFrame = Math.min(
      Math.floor(Math.max(0, f - 5) * rate),
      mediaFrames - 1,
    );
  const active = Math.min(
    scene.steps.length - 1,
    Math.floor(f / (scene.frames / scene.steps.length)),
  );
  return (
    <AbsoluteFill style={{ background: C.paper, color: C.ink }}>
      <div style={{ position: "absolute", left: 24, top: 15 }}>
        <Logo />
        <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>
          {episode.number.toString().padStart(2, "0")} /{" "}
          {episode.audience.split(" · ")[0]}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 288,
          top: 15,
          right: 40,
          fontSize: 35,
          fontWeight: 650,
          letterSpacing: -0.8,
          lineHeight: 1.18,
        }}
      >
        {scene.title}
      </div>
      <div style={{ position: "absolute", left: 24, top: 151, width: 236 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: 2,
            color: C.accent,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          Your next steps
        </div>
        {scene.steps.map((step: string, i: number) => (
          <div
            key={step}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "start",
              marginBottom: 30,
              opacity: i === active ? 1 : 0.55,
            }}
          >
            <div
              style={{
                width: 27,
                height: 27,
                flexShrink: 0,
                borderRadius: 7,
                display: "grid",
                placeItems: "center",
                fontSize: 14,
                color: i === active ? "white" : C.accent,
                background: i === active ? C.accent : "#e0eae1",
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                fontSize: 23,
                lineHeight: 1.25,
                fontWeight: i === active ? 650 : 400,
                maxWidth: 188,
              }}
            >
              {step}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 125,
          width: 236,
          borderTop: "2px solid " + C.accent,
          paddingTop: 18,
        }}
      >
        <div
          style={{
            fontSize: 13,
            letterSpacing: 1.2,
            color: C.accent,
            marginBottom: 12,
          }}
        >
          {roles[scene.role].toUpperCase()}
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.4, fontWeight: 550 }}>
          {scene.callout ||
            "Keep the work and the next action in the same place."}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 287,
          top: 63,
          width: 1602,
          height: 926,
          border: "1px solid " + C.line,
          borderRadius: 9,
          overflow: "hidden",
          boxShadow: "0 8px 35px #18372712",
          background: "white",
        }}
      >
        <div
          style={{
            height: 24,
            background: "#e9efe8",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 10,
            color: C.muted,
            justifyContent: "space-between",
          }}
        >
          <span>● ● ● &nbsp; stdeduai.vercel.app</span>
          <span>Live app · demo account · pauses shortened</span>
        </div>
        <div style={{ width: 1600, height: 900, overflow: "hidden" }}>
          <Freeze frame={videoFrame}>
            <OffthreadVideo
              src={staticFile(`footage/${scene.id}.mp4`)}
              muted
              style={{ width: 1600, height: 900, display: "block" }}
            />
          </Freeze>
        </div>
      </div>
      <Captions scene={scene} />
    </AbsoluteFill>
  );
}
function Scene({ scene, episode }: { scene: any; episode: any }) {
  return (
    <AbsoluteFill>
      <Sequence
        from={15}
        durationInFrames={Math.ceil(scene.audioDuration * 30)}
      >
        <Audio src={staticFile(scene.audio)} />
      </Sequence>
      {scene.kind === "graphic" ? (
        <Graphic scene={scene} episode={episode} />
      ) : (
        <Demo scene={scene} episode={episode} />
      )}
    </AbsoluteFill>
  );
}
function Episode({ episode }: { episode: any }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: "Arial,Helvetica,sans-serif" }}>
      {episode.scenes.map((scene: any) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.frames}
        >
          <Scene scene={scene} episode={episode} />
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          height: 3,
          left: 0,
          bottom: 0,
          background: C.accent,
          width: `${(100 * f) / episode.frames}%`,
        }}
      />
    </AbsoluteFill>
  );
}
const Root = () => {
  const props = getInputProps() as any;
  if (!Array.isArray(props.episodes) || !props.episodes.length)
    throw Error(
      "Generate narration and capture the live footage, then pass the generated manifest with --props.",
    );
  return (
    <>
      {props.episodes.map((episode: any) => (
        <Composition
          key={episode.id}
          id={episode.id}
          component={Episode}
          durationInFrames={episode.frames}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ episode }}
        />
      ))}
    </>
  );
};
registerRoot(Root);
