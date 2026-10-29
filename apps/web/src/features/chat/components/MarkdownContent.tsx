import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { CodeBlock } from "./CodeBlock";

type Props = { content: string };

export const MarkdownContent = React.memo(function MarkdownContent({ content }: Props) {
  return (
    <div className="prose prose-slate max-w-none prose-sm prose-p:leading-7 prose-a:text-blue-ink prose-a:underline-offset-2 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children: React.ReactNode }) => {
            if (inline) {
              return (
                <code className="px-1 py-0.5 rounded bg-muted border border-line text-[13px] font-mono text-title" {...(props as Record<string, unknown>)}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
          a: ({ children, ...props }: { children?: React.ReactNode; href?: string }) => (
            <a {...(props as Record<string, unknown>)} target="_blank" rel="noopener noreferrer" className="text-blue-ink hover:text-blue-ink underline">
              {children}
            </a>
          ),
          table: ({ children }: { children?: React.ReactNode }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-line">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }: { children?: React.ReactNode }) => <th className="bg-raised px-3 py-2 text-left text-xs font-bold border-b border-line">{children}</th>,
          td: ({ children }: { children?: React.ReactNode }) => <td className="px-3 py-2 border-b border-linesoft text-sm">{children}</td>,
          blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-4 border-line pl-4 italic text-secondary my-3">{children}</blockquote>,
          ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>,
          ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>,
          h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-lg font-bold mt-4 mb-2">{children}</h2>,
          h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-bold mt-3 mb-1.5">{children}</h3>,
        } as unknown as Record<string, React.ComponentType<Record<string, unknown>>>}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
