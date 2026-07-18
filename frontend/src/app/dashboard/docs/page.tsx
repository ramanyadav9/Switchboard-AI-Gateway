export default function DocsPage() {
  const navSections = [
    {
      title: "GETTING STARTED",
      items: [
        { label: "Introduction", href: "#introduction" },
        { label: "Authentication", href: "#authentication", active: true },
      ],
    },
    {
      title: "API REFERENCE",
      items: [
        { label: "Chat Completions", href: "#chat-completions" },
        { label: "Transcription", href: "#transcription" },
      ],
    },
  ];

  return (
    <div className="flex gap-0 -m-8 min-h-[calc(100vh)]">
      {/* Left sidebar nav */}
      <aside className="w-[200px] border-r border-[#262626] bg-[#131313] py-8 px-4 shrink-0 sticky top-0 h-screen overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#908fa0] uppercase mb-3">
              {section.title}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    className={`block px-3 py-1.5 text-[14px] leading-[20px] rounded-sm transition-colors ${
                      item.active
                        ? "border-l-2 border-[#c0c1ff] text-[#c0c1ff] bg-[#c0c1ff]/5"
                        : "text-[#c7c4d7] hover:text-[#e5e2e1] hover:bg-[#201f1f]"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      {/* Main content */}
      <main className="flex-1 py-8 px-8 lg:px-12 overflow-y-auto max-w-[900px]">
        {/* Header */}
        <section id="introduction" className="mb-10">
          <h1 className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold text-[#e5e2e1] mb-6">
            API Documentation
          </h1>

          {/* Info banner */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-[#c0c1ff] mt-0.5 shrink-0">lightbulb</span>
            <p className="text-[14px] leading-[20px] text-[#c7c4d7]">
              Switchboard speaks OpenAI&apos;s API format — point your existing SDK at it and go.
              You can seamlessly route traffic without rewriting your application logic.
            </p>
          </div>
        </section>

        <hr className="border-[#262626] mb-10" />

        {/* Authentication */}
        <section id="authentication" className="mb-12">
          <h2 className="text-[24px] leading-[32px] tracking-[-0.01em] font-semibold text-[#e5e2e1] mb-4">
            Authentication
          </h2>
          <p className="text-[14px] leading-[20px] text-[#c7c4d7] mb-3">
            Switchboard uses API keys to authenticate requests. You can view and manage your
            API keys in the Dashboard.
          </p>
          <p className="text-[14px] leading-[20px] text-[#c7c4d7] mb-6">
            Your API keys carry many privileges, so be sure to keep them secure! Do not share
            your secret API keys in publicly accessible areas such as GitHub, client-side code,
            and so forth.
          </p>

          {/* Auth header code box */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-[#262626]">
              <span className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#908fa0] uppercase">
                Authorization Header
              </span>
            </div>
            <div className="px-4 py-3 bg-[#050505]">
              <code className="font-[family-name:var(--font-mono)] text-[13px] leading-[20px] text-[#e5e2e1]">
                Authorization: <span className="text-[#c0c1ff]">Bearer</span>{" "}
                <span className="text-[#ffb783]">&lt;SWITCHBOARD_API_KEY&gt;</span>
              </code>
            </div>
          </div>
        </section>

        <hr className="border-[#262626] mb-10" />

        {/* Chat Completions */}
        <section id="chat-completions" className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[24px] leading-[32px] tracking-[-0.01em] font-semibold text-[#e5e2e1]">
              Chat Completions
            </h2>
            <span className="bg-[#6366f1] text-white rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase">
              POST
            </span>
          </div>
          <p className="text-[14px] leading-[20px] text-[#c7c4d7] mb-6">
            Given a list of messages comprising a conversation, the model will return a response.
            This endpoint routes seamlessly to your configured models based on your active routing rules.
          </p>

          {/* Endpoint */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg overflow-hidden mb-4">
            <div className="px-4 py-2 border-b border-[#262626] flex items-center gap-2">
              <span className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#908fa0] uppercase">
                Endpoint
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[13px] leading-[20px] text-[#e5e2e1]">
                /v1/chat/completions
              </span>
            </div>
            <div className="p-4 bg-[#050505] overflow-x-auto">
              <pre className="font-[family-name:var(--font-mono)] text-[13px] leading-[20px] text-[#c7c4d7]">{`curl https://your-server/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $SWITCHBOARD_API_KEY" \\
  -d '{
    "model": "Qwen3-14B",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'`}</pre>
            </div>
          </div>
        </section>

        <hr className="border-[#262626] mb-10" />

        {/* Transcription */}
        <section id="transcription" className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[24px] leading-[32px] tracking-[-0.01em] font-semibold text-[#e5e2e1]">
              Transcription
            </h2>
            <span className="bg-[#6366f1] text-white rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase">
              POST
            </span>
          </div>
          <p className="text-[14px] leading-[20px] text-[#c7c4d7] mb-4">
            Transcribes audio into the input language. Supports routing to Whisper and other
            compatible transcription models.
          </p>
          <a
            href="#"
            className="inline-flex items-center gap-1 text-[14px] leading-[20px] text-[#c0c1ff] hover:text-[#8083ff] transition-colors"
          >
            Read full transcription guide
            <span className="text-sm">→</span>
          </a>
        </section>
      </main>
    </div>
  );
}
