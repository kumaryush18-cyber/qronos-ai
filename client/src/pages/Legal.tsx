import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/pages/Models";
import { StarButton } from "@/components/StarButton";
import {
  ShieldCheck,
  FileText,
  RotateCcw,
  CheckCircle2,
  Lock,
  MessageCircle,
  HelpCircle,
  Clock,
  ArrowRight
} from "lucide-react";
import { useLocation, Link, Redirect } from "wouter";
import { trpc } from "@/lib/trpc";
import "./infergate-docs-legal.css";

export type LegalVariant = "terms" | "privacy" | "refund" | "acceptable-use" | "security";

interface LegalSection {
  heading: string;
  body: string;
  bullets?: string[];
  callout?: string;
  calloutType?: "default" | "emerald" | "amber";
}

interface LegalPolicy {
  label: string;
  title: string;
  subtitle: string;
  effectiveDate: string;
  icon: typeof ShieldCheck;
  sections: LegalSection[];
}

const legalContent: Record<LegalVariant, LegalPolicy> = {
  terms: {
    label: "Terms of Service",
    title: "Terms and Conditions for Qronos AI LLM Gateway",
    subtitle:
      "Effective October 2026 (Version 3.0). These Terms of Service constitute a legally binding agreement between you and Qronos AI Systems governing access to the Qronos AI developer platform, API routing infrastructure, load-balancing services, and compute capacity allowances.",
    effectiveDate: "October 2026 (Version 3.0)",
    icon: FileText,
    sections: [
      {
        heading: "1. Acceptance of Terms & Legal Authority",
        body: "By creating an account, generating API secret keys, topping up usage balances, or transmitting requests to Qronos AI gateway endpoints (/v1/messages or /v1/chat/completions), you expressly agree to be bound by these Terms of Service, our Privacy Policy, Refund Policy, and Acceptable Use Policy. If you access Qronos AI on behalf of a company or enterprise, you warrant that you possess full legal authority to bind that entity.",
        bullets: [
          "You must be at least 18 years of age or the age of legal majority in your jurisdiction to hold an active developer account.",
          "You must not be located in a jurisdiction subject to comprehensive international sanctions or designated on government restricted-party lists.",
          "You agree to provide authentic and current account details during registration.",
        ],
      },
      {
        heading: "2. Description of Qronos AI Services",
        body: "Qronos AI operates high-performance developer infrastructure software providing intelligent multi-model routing, bidirectional protocol normalization (Anthropic Messages API <-> OpenAI Chat Completions), automated 429 circuit breaking, and sub-millisecond telemetry. Qronos AI operates strictly as an independent software middleware and reverse proxy layer.",
        bullets: [
          "Model Fidelity Assurance: Qronos AI routes requests strictly according to your selected model identifier; we never silently substitute, downgrade, or alter model specifications without your explicit configuration.",
          "Compatibility & Third-Party Disclaimer: Qronos AI is an independent developer platform. All model trademarks (including Anthropic, OpenAI, DeepSeek, Qwen, Z.AI, Moonshot) belong to their respective owners and are referenced solely to denote technical protocol compatibility.",
          "Digital Fulfillment: Access to developer dashboards, API secret keys, and usage capacity is provisioned electronically and immediately upon completed checkout or authentication.",
        ],
      },
      {
        heading: "3. API Key Custody & Account Security",
        body: "You bear sole responsibility for safeguarding your API keys, session tokens, and workspace credentials. Any request signed with an active API key generated in your workspace is conclusively deemed to have been authorized by your account.",
        bullets: [
          "API keys are sensitive credentials. Never commit plaintext keys to public repositories, client-side web code, or unencrypted storage.",
          "One-Time Key Reveal: Qronos AI displays plaintext API keys exactly once upon creation. Our database retains only salted, non-reversible cryptographic hashes (HMAC-SHA256).",
          "You must immediately revoke compromised keys from the Developer Dashboard and notify our team if unauthorized activity is detected.",
        ],
      },
      {
        heading: "4. Billing, Capacity & Nanodollar Accounting",
        body: "Qronos AI provisions compute capacity through pay-as-you-go balances and developer packages. Requests routed through our gateway are metered according to the exact input and output token counts reported by underlying inference endpoints, priced in nanodollars ($10⁻⁹ USD) to prevent rounding discrepancies.",
        bullets: [
          "Two-Phase Reservation: Estimated maximum request cost is temporarily reserved before upstream dispatch and settled precisely against returned tokens post-completion. Interrupted or failed requests release 100% of the reserved amount.",
          "Accepted Payment Rails: Major international credit/debit cards, domestic UPI (INR), and cryptocurrency settlement (Solana Pay / USDC). All cryptocurrency payments are decentralized, final, and strictly non-refundable at any cost.",
          "Merchant of Record & Tax Compliance: Card transactions are processed in accordance with global merchant of record standards, statutory tax obligations (VAT, GST, sales tax), and PCI-DSS Level 1 specifications.",
        ],
      },
      {
        heading: "5. Intellectual Property & Zero Model Training Guarantee",
        body: "Qronos AI claims zero ownership over your proprietary prompts, application data, code, or model completions.",
        bullets: [
          "Customer Ownership: You retain all right, title, and intellectual property interest in your submitted prompts and resulting model outputs.",
          "Absolute Zero-Training Guarantee: Qronos AI STRICTLY DOES NOT use your prompts, system instructions, tool outputs, or completions to train, fine-tune, or optimize machine learning models.",
          "Platform Rights: Qronos AI Systems retains all rights, title, and interest in the Qronos AI platform, proxy routing engine, APIs, and documentation.",
        ],
        callout: "Qronos AI enforces an immutable zero-training guarantee across all enterprise routes. Your prompts are routed ephemerally in memory over TLS 1.3 and are never logged or sold for AI model training.",
        calloutType: "emerald",
      },
      {
        heading: "6. Rate Limits & Fair Usage",
        body: "Qronos AI does not impose restrictive daily request limits on verified developer accounts. However, to preserve platform integrity and protect upstream cluster capacity, Qronos AI enforces sliding-window rate limiters. Deliberate attempts to bypass rate limiters, launch DDoS attacks, or exploit billing endpoints are strictly prohibited.",
      },
      {
        heading: "7. Disclaimers of Warranties",
        body: "Qronos AI is provided on an 'AS IS' and 'AS AVAILABLE' basis. To the maximum extent permitted by applicable law, Qronos AI Systems and its affiliates disclaim all warranties, express, implied, statutory, or otherwise, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
        bullets: [
          "Artificial intelligence outputs are probabilistic in nature; Qronos AI does not guarantee the factual accuracy or suitability of outputs generated by underlying model providers.",
          "Upstream model providers may experience maintenance windows or latency variations beyond Qronos AI's direct operational control.",
        ],
      },
      {
        heading: "8. Limitation of Liability",
        body: "To the maximum extent permitted by applicable law, in no event shall Qronos AI Systems, its directors, officers, employees, or partners be liable for any indirect, incidental, consequential, special, or punitive damages, including loss of profits, data, goodwill, or business interruption.",
        callout: "In all circumstances, Qronos AI's total aggregate liability arising out of or related to these terms shall not exceed the total fees paid by you to Qronos AI in the twelve (12) months immediately preceding the event giving rise to liability.",
        calloutType: "amber",
      },
      {
        heading: "9. Termination & Suspension",
        body: "Qronos AI reserves the right to suspend or terminate accounts, revoke API keys, and freeze usage balances immediately if: (a) you violate these Terms or the Acceptable Use Policy; (b) your account engages in fraudulent payment activity or chargeback abuse; or (c) required by applicable law, regulatory order, or law enforcement mandate.",
      },
      {
        heading: "10. Governing Law & Dispute Resolution",
        body: "These Terms shall be governed by and construed in accordance with applicable laws without regard to conflict of law principles. Any dispute arising under these Terms shall be resolved through binding individual arbitration, and you waive any right to participate in class-action proceedings.",
      },
      {
        heading: "11. Contact & Inquiries",
        body: "For inquiries regarding these Terms, enterprise SLAs, or formal legal notices, please reach out via email at contact@qronos.me or via our official Discord developer channel.",
      },
    ],
  },

  privacy: {
    label: "Privacy Policy",
    title: "Privacy Notice and Data Protection Policy",
    subtitle:
      "Effective October 2026 (Version 3.0). This Privacy Policy explains how Qronos AI collects, processes, and protects your developer metadata in strict compliance with GDPR, CCPA/CPRA, and international data privacy regulations.",
    effectiveDate: "October 2026 (Version 3.0)",
    icon: ShieldCheck,
    sections: [
      {
        heading: "1. Scope & Data Controller Information",
        body: "Qronos AI Systems operates the Qronos AI API Gateway and developer management portal. We act as Data Controller regarding your account credentials, billing metadata, and telemetry logs, and as Data Processor regarding transient API request payloads routed to upstream model providers on your command.",
      },
      {
        heading: "2. Data We Collect (Data Minimization)",
        body: "Qronos AI adheres strictly to data minimization standards, collecting only metadata necessary to authenticate requests, enforce rate limits, prevent fraud, and execute token billing:",
        bullets: [
          "Account Identity: OAuth identifiers (GitHub, Discord, Google), primary verified email address, and username.",
          "API Key Fingerprints: Non-reversible salted cryptographic hashes (HMAC-SHA256) of your API keys, key creation dates, and last-used timestamps.",
          "Transaction Records: Order identifiers, transaction timestamps, payment rail (Card, UPI, or Solana), and masked tokens. Note: Qronos AI NEVER stores raw credit card numbers or banking PINs.",
          "Operational Telemetry: HTTP method, requested model identifier, prompt and completion token counts, latency (ms), status codes, and hashed IP addresses for rate limiting.",
        ],
      },
      {
        heading: "3. Ephemeral Routing & Zero Persistent Prompt Logging",
        body: "Our absolute core commitment to developers: Qronos AI DOES NOT log or persist your prompt text, tool inputs, or completion outputs in any permanent database or analytical warehouse.",
        callout: "All API payloads are processed in volatile memory and routed over encrypted TLS 1.3 connections. As soon as the final streaming chunk is delivered to your client, the memory buffer is immediately reclaimed by the garbage collector.",
        calloutType: "emerald",
      },
      {
        heading: "4. Legal Bases for Processing (GDPR Compliance)",
        body: "Under Regulation (EU) 2016/679 (GDPR), we process your metadata on the following legal bases:",
        bullets: [
          "Performance of a Contract (Art. 6(1)(b)): Required to provision your API gateway capacity and route inference requests.",
          "Legitimate Interests (Art. 6(1)(f)): Securing our infrastructure against malicious attacks, preventing fraud, and ensuring 99.99% system uptime.",
          "Legal Obligations (Art. 6(1)(c)): Retaining financial transaction logs to satisfy statutory accounting, tax, and anti-money laundering requirements.",
        ],
      },
      {
        heading: "5. Third-Party Sub-Processors",
        body: "We partner with trusted, SOC 2 / ISO 27001 certified sub-processors adhering to rigorous data protection agreements:",
        bullets: [
          "Payment Processors: PCI-DSS Level 1 compliant merchant processors (Dodo Payments, Cashfree, and decentralized Solana RPC networks).",
          "Cloud Infrastructure: Enterprise cloud hosting providers with end-to-end hardware encryption and SOC 2 Type II certifications.",
          "Upstream Model Publishers: Direct enterprise endpoints (Anthropic, OpenAI, DeepSeek, Qwen) bound by strict non-training and data confidentiality covenants.",
        ],
      },
      {
        heading: "6. Data Retention & Erasure",
        body: "Account identity records are retained for the duration of your active account relationship. Financial invoices are retained for the statutory tax period (typically 7 years). Short-term operational telemetry metrics are automatically scrubbed or aggregated after 30 days.",
      },
      {
        heading: "7. Your Data Protection Rights",
        body: "Under GDPR, CCPA/CPRA, and global privacy frameworks, you have the right to:",
        bullets: [
          "Request access to your stored personal metadata.",
          "Request rectification of inaccurate account records.",
          "Request permanent deletion of your account and associated credentials ('Right to be Forgotten') within 30 days.",
          "Export your transaction and usage history in machine-readable JSON format.",
          "We will never discriminate against you for exercising your data rights.",
        ],
      },
      {
        heading: "8. Security Safeguards & Encryption",
        body: "All external network communications use TLS 1.3 encryption. Upstream provider credentials and state vaults are encrypted at rest using AES-256-GCM authenticated encryption with random IVs.",
      },
      {
        heading: "9. Qronos Code Editor Extension",
        body: "The Qronos Code extension for Visual Studio Code runs on your machine and connects to the Qronos AI gateway. This section describes what the extension itself sends and stores, separately from API usage through the gateway.",
        bullets: [
          "Workspace content: the agent reads files you ask it to work on and sends only the content required for the current request to the model provider you selected. File contents are not uploaded in bulk, and no background scan leaves your machine unless codebase indexing is enabled in settings.",
          "Prompts and tool output: your messages, tool results and command output travel to the selected model provider for the duration of the request. They are not retained by Qronos AI after the response is delivered, in line with section 3.",
          "Local storage: authentication credentials, session history, settings and logs are written to ~/.local/share/qronos (Linux/macOS) or %LOCALAPPDATA%\\qronos (Windows) on your own disk. Removing the extension or signing out deletes the credentials; you can delete the directory at any time to remove everything.",
          "GitHub sign-in: the extension uses the GitHub device flow. Qronos AI receives your GitHub account identifier, username and verified email address to create or link your account, and receives no access to your repositories.",
          "Web search: search queries are sent to third-party search providers (currently Exa and Parallel) to return results. The query text leaves your machine; the pages you open are fetched by the extension.",
          "Sponsor messages: the chat panel may request a sponsored placement from Gravity, which receives the placement identifier and general session information needed to serve an ad. No prompts or file contents are sent with that request.",
          "Custom providers and MCP servers: if you configure your own model endpoint or MCP server, the extension sends requests directly to that endpoint under the credentials you supply. Those third parties are outside Qronos AI's control and are governed by their own policies.",
          "Telemetry: product telemetry is limited to feature usage and error events, and it can be disabled in VS Code settings (qronos-code.new.telemetry or the global telemetry.telemetryLevel setting). Prompts, file contents and command output are never included in telemetry events.",
        ],
        callout: "The extension does not train models on your code, does not run a background crawler of your workspace, and does not send repository contents to Qronos AI as a whole. Every outbound request is triggered by an action in your session.",
        calloutType: "emerald",
      },
    ],
  },

  refund: {
    label: "Refund Policy",
    title: "Transparent Refund, Cancellation & Delivery Policy",
    subtitle:
      "Effective October 2026 (Version 3.0). Qronos AI provides a clear, fair, and reliable refund policy designed in strict alignment with international consumer protection standards and Merchant of Record guidelines.",
    effectiveDate: "October 2026 (Version 3.0)",
    icon: RotateCcw,
    sections: [
      {
        heading: "1. Our Commitment to Developer Trust",
        body: "At Qronos AI, we want developers and engineering teams to build with confidence. We maintain an open, fair, and straightforward refund policy for eligible fiat payment transactions (including international credit/debit cards and domestic UPI). Please note: all cryptocurrency transactions (including Solana Pay, SOL, USDC, and on-chain deposits) are decentralized, final, and strictly non-refundable at any cost under all circumstances.",
      },
      {
        heading: "2. Instant Digital Delivery & 30-Day Unused Refund Window (Fiat Only)",
        body: "API usage capacity is an electronic digital product delivered instantly to your account upon transaction confirmation. In alignment with global Merchant of Record compliance guidelines, Qronos AI provides a 30-day refund window from the date of purchase for any unconsumed usage capacity balance purchased via eligible fiat payment rails (Cards and Domestic UPI). All cryptocurrency transactions are strictly excluded and non-refundable at any cost.",
        callout: "Capacity is delivered instantly upon checkout. If you purchase capacity via eligible fiat payment methods (Card or UPI) and have unconsumed credit remaining, you may request a 100% refund of your unused capacity balance within thirty (30) calendar days of transaction completion. Cryptocurrency payments are final and strictly non-refundable at any cost.",
        calloutType: "emerald",
      },
      {
        heading: "3. Qualifying Scenarios for Refunds (Fiat Payments Only)",
        body: "For eligible purchases completed via fiat payment rails (Credit/Debit Cards and Domestic UPI), you are entitled to a full or pro-rated refund under any of the following circumstances:",
        bullets: [
          "Unused Balance Returns: You purchased an API package or balance top-up via Card or UPI within the last 30 days and have unused quota remaining in your account.",
          "Service Outages: Verified prolonged platform downtime or persistent routing failures that prevented Qronos AI from fulfilling your API requests within reasonable SLA expectations.",
          "Duplicate Charges: Multiple charges generated due to network latency, gateway timeouts, or accidental duplicate submissions on fiat rails.",
          "Allocation Discrepancies: Any technical fault where purchased fiat capacity was not properly credited to your account balance.",
        ],
      },
      {
        heading: "4. Non-Refundable Scenarios & Cryptocurrency Policy",
        body: "Refunds cannot be issued under any of the following conditions:",
        bullets: [
          "Cryptocurrency Payments (Strictly Non-Refundable at Any Cost): All cryptocurrency payments and on-chain deposits (including Solana Pay, SOL, USDC, and digital token transfers) are 100% final and strictly non-refundable at any cost under all circumstances. Due to the immutable, decentralized nature of blockchain transactions and immediate computational token provisioning, crypto payments cannot be refunded, reversed, charged back, or exchanged under any scenario.",
          "Consumed Compute: Capacity is delivered electronically and is non-refundable once consumed for completed model inference requests (where tokens were successfully computed and returned).",
          "Acceptable Use Violations: Accounts suspended or terminated due to verified violations of our Acceptable Use Policy (such as abusive attacks, malware generation, automated scraping, or illegal activities).",
          "Expired Eligibility Window: Refund requests submitted more than thirty (30) calendar days after the original transaction date.",
          "On-Chain Network Gas Fees: For cryptocurrency payments via Solana, all network validator and gas fees (~$0.00025) are inherently non-recoverable.",
        ],
      },
      {
        heading: "5. Step-by-Step Refund Procedure",
        body: "Submitting a refund request is simple and transparent:",
        bullets: [
          "Step 1: Contact our billing desk directly at contact@qronos.me or via our official Discord support channel.",
          "Step 2: Provide your account email, Order ID (e.g., 'TF_...' or card payment reference), transaction date, and the reason for your refund request.",
          "Step 3: Our billing desk reviews and approves qualifying refund submissions within 24 to 48 hours (maximum 1–3 business days).",
          "Step 4: Once approved, the refund is immediately triggered back to your original payment method.",
        ],
      },
      {
        heading: "6. Processing Timeframes by Payment Rail",
        body: "Once approved by our billing desk, the timeframe for eligible fiat refunds depends on the payment rail utilized:",
        bullets: [
          "Credit & Debit Cards: Processed via certified merchant gateways. Funds typically reflect on your card statement within 5 to 10 business days depending on your bank's clearing cycle.",
          "Domestic UPI (INR): Processed directly back to the originating bank VPA or bank account via IMPS/NEFT within 24 to 48 business hours.",
          "Cryptocurrency (Solana Pay / SOL / USDC): Strictly Non-Refundable at Any Cost. All on-chain cryptocurrency payments are final and non-reversible upon transaction confirmation; no refunds, returns, or wallet re-deposits are issued for crypto payments under any scenario.",
        ],
      },
      {
        heading: "7. Subscription & Cancellation Policy",
        body: "Qronos AI operates on an on-demand, prepaid pay-as-you-go model. We DO NOT enforce locked recurring monthly subscription contracts. You only pay when you choose to top up your balance. As there are no forced recurring fees, you may cease using Qronos AI at any time without incurring cancellation penalties.",
      },
      {
        heading: "8. Dispute Resolution Notice",
        body: "We strongly recommend contacting Qronos AI Support directly at contact@qronos.me before filing a formal bank dispute or chargeback. Our billing desk can verify orders and issue direct refunds significantly faster than third-party dispute arbitrations.",
      },
    ],
  },

  "acceptable-use": {
    label: "Acceptable Use Policy",
    title: "Standards for Responsible Platform Use",
    subtitle:
      "Effective October 2026 (Version 3.0). This Acceptable Use Policy outlines prohibited activities, safety standards, and operational guidelines governing every Qronos AI account and API integration.",
    effectiveDate: "October 2026 (Version 3.0)",
    icon: CheckCircle2,
    sections: [
      {
        heading: "1. Core Philosophy",
        body: "Qronos AI empowers developers to build autonomous agents, software tools, and intelligent applications using cutting-edge AI infrastructure. We expect all developers to employ our APIs responsibly, safely, and in compliance with international laws.",
      },
      {
        heading: "2. Strictly Prohibited Activities",
        body: "You must not utilize Qronos AI APIs, model routes, or infrastructure for:",
        bullets: [
          "Malicious Cyber Activity: Developing malware, ransomware, exploit payloads, phishing frameworks, automated credential stuffing, or DDoS tools.",
          "CSAM & Exploitation: Generating or facilitating Child Sexual Abuse Material (zero tolerance; violators are immediately terminated and reported to law enforcement).",
          "Illegal Operations: Money laundering, unauthorized financial fraud, human trafficking, or intellectual property infringement.",
          "Harassment & Hate Speech: Generating abusive, threatening, or defamatory content targeted at individuals or protected groups.",
          "Weapons & Physical Harm: Designing chemical, biological, nuclear weapons, explosives, or military munitions.",
          "Deceptive Impersonation: Deploying synthetic bots designed to deceive consumers by impersonating real individuals, courts, or financial institutions.",
        ],
      },
      {
        heading: "3. Infrastructure & Network Integrity",
        body: "You must safeguard the performance and availability of the Qronos AI network. You agree not to:",
        bullets: [
          "Probe, scan, or fuzz the vulnerability of our API endpoints without explicit written authorization.",
          "Circumvent rate limiting, token compaction, or credit deduction algorithms.",
          "Scrape or bulk-extract Qronos AI dashboard telemetry or operational data.",
          "Share master administrative credentials with unauthorized third parties.",
        ],
      },
      {
        heading: "4. Enforcement & Reporting",
        body: "Qronos AI employs automated anomaly detection to identify volumetric abuse and infrastructure attacks. Material violations will result in immediate API key revocation and permanent account suspension. Suspected violations may be reported directly to our trust and safety team.",
      },
    ],
  },

  security: {
    label: "Security & Governance",
    title: "Enterprise Security & Infrastructure Governance",
    subtitle:
      "Effective October 2026. A detailed breakdown of Qronos AI's defense-in-depth architecture, cryptographic credential vaults, rate-limiting layers, and operational resilience standards.",
    effectiveDate: "October 2026 (Version 3.0)",
    icon: Lock,
    sections: [
      {
        heading: "1. Cryptographic Credential Vaults (AES-256-GCM)",
        body: "All sensitive upstream provider credentials, dynamic runtime configurations, and multi-turn tool continuation state are encrypted at rest using AES-256-GCM authenticated encryption. Encryption keys are derived via SHA-256 context-separated key schedules, with 12-byte random IVs and 16-byte authentication tags protecting against tampering.",
      },
      {
        heading: "2. Zero Plaintext API Key Storage",
        body: "Client API keys (qr_...) are generated with 256 bits of cryptographically secure random entropy. Plaintext keys are displayed once to the developer and never stored in our persistent database. Incoming requests are authenticated against HMAC-SHA256 digests evaluated with timingSafeEqual to prevent side-channel timing attacks.",
      },
      {
        heading: "3. Multi-Layer Rate Limiting Defense",
        body: "Qronos AI enforces a 6-tier defense-in-depth rate limiting structure:",
        bullets: [
          "Global IP Rate Limiter: 2,400 req/min blanket umbrella protection.",
          "Inference Gateway Limiter: 60 req/min per IP on /v1 routes.",
          "Account Sliding Window: 60 req/min per authenticated developer ID, preventing VPN/proxy rotation bypasses.",
          "Payment & Order Limiter: 10 req/min on checkout endpoints.",
          "tRPC Dashboard Limiter: 1,200 req/min on administrative APIs.",
          "Binance Spot Oracle Limiter: 30 req/min cache protection for Solana pricing.",
        ],
      },
      {
        heading: "4. Network & Transport Security",
        body: "All external communications enforce TLS 1.3 encryption. Reverse proxy layers validate authoritative Host headers and reject null-origin CORS requests. Sensitive cookies use HTTP-only, Secure, and SameSite=Lax flags.",
      },
      {
        heading: "5. Vulnerability Disclosure",
        body: "If you discover a security vulnerability in the Qronos AI platform, please report it responsibly to our security team. We investigate all disclosures promptly and provide bounty rewards for qualifying verified findings.",
      },
    ],
  },
};

function parseLegalVariant(pathname: string): LegalVariant {
  const normalized = pathname.toLowerCase().replace(/^\/+|\/+$/g, "");
  const segment = normalized.split("/").pop() || "terms";
  if (segment === "terms" || segment === "tos" || segment === "terms-of-service") return "terms";
  if (segment === "privacy" || segment === "privacy-policy") return "privacy";
  if (segment === "refund" || segment === "refunds" || segment === "refund-policy" || segment === "cancellation") return "refund";
  if (segment === "acceptable-use" || segment === "acceptable_use" || segment === "aup") return "acceptable-use";
  if (segment === "security" || segment === "trust" || segment === "governance") return "security";
  return "terms";
}

export default function Legal() {
  const [location] = useLocation();
  const refundStatus = trpc.public.refundPolicyStatus.useQuery(undefined, {
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const isRefundEnabled = refundStatus.data?.enabled ?? true;

  const variant = parseLegalVariant(location);

  // If the refund policy is toggled OFF and a user visits any refund URL, redirect cleanly to terms
  if (variant === "refund" && !isRefundEnabled) {
    return <Redirect to="/legal/terms" replace />;
  }

  const content = legalContent[variant] ?? legalContent.terms;
  const ActiveIcon = content.icon;

  const navItems = [
    { id: "terms", href: "/legal/terms", label: "Terms of Service" },
    { id: "privacy", href: "/legal/privacy", label: "Privacy Policy" },
    ...(isRefundEnabled ? [{ id: "refund", href: "/legal/refund", label: "Refund Policy" }] : []),
    { id: "acceptable-use", href: "/legal/acceptable-use", label: "Acceptable Use" },
    { id: "security", href: "/legal/security", label: "Security & Governance" },
  ];

  return (
    <div className="min-h-screen bg-[#08090d] text-white flex flex-col font-sans selection:bg-white/20 selection:text-white relative overflow-x-hidden">
      {/* Background Ambience (No Spiral / No Grid) */}
      <div className="infergate-doc-glow" />

      <PublicNav />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 relative z-10 flex-1 w-full">
        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-zinc-300 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>QRONOS AI · COMPLIANCE & GOVERNANCE</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light text-white tracking-tight leading-[1.05]">
            {content.title}
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            {content.subtitle}
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
            <span className="px-3 py-1 rounded-full bg-white/[0.04] text-zinc-300 border border-white/10 flex items-center gap-1.5">
              <Clock size={12} />
              <span>{content.effectiveDate}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-white/[0.04] text-zinc-300 border border-white/10">
              PCI-DSS & MoR Compliant
            </span>
            <span className="px-3 py-1 rounded-full bg-white/[0.04] text-zinc-300 border border-white/10">
              Zero Model Training Policy
            </span>
          </div>

          <div className="pt-4 flex items-center justify-center gap-3">
            <Link href="/signup">
              <StarButton backgroundColor="#000000" className="rounded-full border border-slate-200/50 px-6 py-2.5 text-xs font-mono">
                <span>GET API KEY</span>
                <span className="ml-1 tracking-tighter font-mono font-bold text-xs">»</span>
              </StarButton>
            </Link>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Navigation Sidebar */}
          <aside className="lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-semibold px-2">
                Legal & Governance
              </div>
              <div className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`block px-3.5 py-2.5 rounded-xl text-xs font-mono transition-all ${
                      variant === item.id
                        ? "bg-white/[0.08] text-white border border-white/20 font-semibold shadow-sm"
                        : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* Direct Support Card */}
              <div className="p-4 rounded-2xl bg-neutral-900/90 border border-white/10 text-xs font-mono space-y-2.5 mt-6">
                <div className="font-semibold text-white">Compliance Desk</div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Need assistance with an invoice, corporate agreement, or security audit?
                </p>
                <a
                  href="https://discord.gg/PGVmBGht7r"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-white hover:text-zinc-300 font-medium pt-1"
                >
                  <MessageCircle size={13} />
                  <span>Discord Support Desk →</span>
                </a>
              </div>
            </div>
          </aside>

          {/* Policy Sections */}
          <article className="lg:col-span-9 space-y-8">
            {content.sections.map((section, idx) => (
              <section
                key={section.heading}
                className="p-6 sm:p-8 rounded-2xl bg-[#090c10] border border-white/[0.08] space-y-4 shadow-xl"
              >
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {section.heading}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  {!isRefundEnabled && section.body.includes("Refund Policy, and ")
                    ? section.body.replace("Refund Policy, and ", "")
                    : section.body}
                </p>

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-3 space-y-2 pt-1">
                    {section.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 mt-2 flex-shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.callout && (
                  <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.02] text-xs sm:text-sm leading-relaxed text-zinc-300 font-sans">
                    <strong className="text-white">Important Note: </strong>
                    {section.callout}
                  </div>
                )}
              </section>
            ))}
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
