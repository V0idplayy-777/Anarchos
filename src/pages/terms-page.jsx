import { Link } from "../lib/router";
import { PageHeader } from "../components/ui";

const SECTIONS = [
  {
    title: "1. About these terms",
    body: [
      "These Terms of Service (“Terms”) govern your access to and use of Anarchos, a video sharing service. By creating an account or using the service, you agree to these Terms. If you do not agree, do not create an account or use the service.",
      "We may update these Terms as the product evolves. When we make material changes we will update the effective date below. Continued use of the service after a change takes effect means you accept the revised Terms.",
    ],
  },
  {
    title: "2. Eligibility and accounts",
    body: [
      "You must be at least 13 years old, or the minimum digital consent age in your country, to create an account. You are responsible for the accuracy of the information you provide and for keeping your password secure. Do not share your account with anyone else or use an account that is not yours.",
      "You are responsible for activity that happens under your account. If you believe your account has been compromised, change your password immediately and contact us.",
    ],
  },
  {
    title: "3. Your content",
    body: [
      "You keep ownership of the videos, captions, comments and profile information you submit (“your content”). By uploading content you grant Anarchos the limited, worldwide, royalty-free licence needed to store, transcode, display and distribute that content as part of operating the service. This licence ends when you delete the content or your account, except for content that has been shared with others and not deleted by you.",
      "You are responsible for the content you upload. You confirm that you hold the necessary rights to publish it, including music, footage and the likeness of identifiable people.",
    ],
  },
  {
    title: "4. Acceptable use",
    body: [
      "You may not use Anarchos to upload, share or promote content that is illegal, that you do not have the rights to publish, that depicts the sexual exploitation or abuse of minors, that promotes terrorism or violent extremism, or that targets people with harassment, threats, or hate based on a protected characteristic.",
      "You also may not attempt to access another member's private messages, interfere with the operation of the service, scrape or resell the service, upload malicious code, or circumvent rate limits and security controls. We may remove content, limit features, suspend accounts or report unlawful activity where required.",
    ],
  },
  {
    title: "5. Messaging and privacy",
    body: [
      "Direct messages are only available between members who follow each other. Messages you send are visible to the recipient, and either of you may end the ability to message by unfollowing. We do not read private messages except to investigate reports, prevent abuse or comply with the law.",
      "Our handling of personal information is described in our privacy notices. We store the data needed to run your account, including your profile, uploads and message history, on infrastructure operated for the service.",
    ],
  },
  {
    title: "6. Availability and changes",
    body: [
      "We work to keep Anarchos available and reliable, but the service is provided on an “as is” and “as available” basis. Features may change, and we may interrupt the service for maintenance or reasons beyond our control. We do not guarantee that any particular video or account will remain available indefinitely.",
      "To the maximum extent permitted by law, Anarchos is not liable for indirect, incidental or consequential damages, or for lost data or lost profits, arising from your use of the service.",
    ],
  },
  {
    title: "7. Termination and deleting your account",
    body: [
      "You can delete your account at any time from Settings. Deleting your account permanently removes your profile, uploaded videos, likes, comments, follow relationships and messages from our systems. Content that other people copied or re-shared before you deleted it may still exist outside Anarchos.",
      "We may suspend or terminate accounts that violate these Terms, or where we are legally required to do so. Where allowed by law, we will try to tell you beforehand and explain what happened.",
    ],
  },
  {
    title: "8. Contact",
    body: [
      "Questions, reports of abuse, or copyright concerns can be sent to the Anarchos team through the in-app reporting channel or by contacting the account owner directly. We review reports in the order they are received.",
    ],
  },
];

export function TermsPage({ standalone = false }) {
  return (
    <div className="space-y-6">
      {!standalone ? (
        <PageHeader title="Terms of Service" description="Effective 1 January 2026." />
      ) : (
        <header className="space-y-1 border-b border-line-700 pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Terms of Service</h1>
          <p className="text-sm text-zinc-500">Effective 1 January 2026.</p>
        </header>
      )}

      <article className="space-y-6 text-sm leading-relaxed text-zinc-300">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-base font-semibold text-zinc-100">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="mt-2.5">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>

      {standalone ? (
        <p className="border-t border-line-700 pt-5 text-sm text-zinc-500">
          <Link to="/" className="font-medium text-brand-300 hover:text-brand-200">
            Back to Anarchos
          </Link>
        </p>
      ) : null}
    </div>
  );
}
