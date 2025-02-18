import { invariant } from 'foxact/invariant';
import createKeywordFilter from '../aho-corasick';
import { buildParseDomainMap, sortDomains } from '../stable-sort-domain';
import { RuleOutput } from './base';
import type { SingboxSourceFormat } from '../singbox';

type Preprocessed = string[];

export class DomainsetOutput extends RuleOutput<Preprocessed> {
  protected type = 'domainset' as const;

  preprocess() {
    const kwfilter = createKeywordFilter(this.domainKeywords);

    const results: string[] = [];

    this.domainTrie.dump((domain) => {
      if (kwfilter(domain)) {
        return;
      }
      results.push(domain);
    }, true);

    const sorted = results;
    sorted.push('this_ruleset_is_made_by_sukkaw.ruleset.skk.moe');

    return sorted;
  }

  surge(): string[] {
    return this.$preprocessed;
  }

  clash(): string[] {
    return this.$preprocessed.map(i => (i[0] === '.' ? `+${i}` : i));
  }

  singbox(): string[] {
    const domains: string[] = [];
    const domainSuffixes: string[] = [];

    for (let i = 0, len = this.$preprocessed.length; i < len; i++) {
      const domain = this.$preprocessed[i];
      if (domain[0] === '.') {
        domainSuffixes.push(domain.slice(1));
      } else {
        domains.push(domain);
      }
    }

    return RuleOutput.jsonToLines({
      version: 2,
      rules: [{
        domain: domains,
        domain_suffix: domainSuffixes
      }]
    } satisfies SingboxSourceFormat);
  }

  protected apexDomainMap: Map<string, string> | null = null;
  protected subDomainMap: Map<string, string> | null = null;
  withDomainMap(apexDomainMap: Map<string, string>, subDomainMap: Map<string, string>) {
    this.apexDomainMap = apexDomainMap;
    this.subDomainMap = subDomainMap;
    return this;
  }

  getStatMap() {
    invariant(this.$preprocessed, 'Non dumped yet');

    if (!this.apexDomainMap || !this.subDomainMap) {
      const { domainMap } = buildParseDomainMap(this.$preprocessed);
      this.apexDomainMap = domainMap;
    }

    return Array.from(this.$preprocessed
      .reduce<Map<string, number>>(
        (acc, cur) => {
          const suffix = this.apexDomainMap!.get(cur);
          if (suffix) {
            acc.set(suffix, (acc.get(suffix) ?? 0) + 1);
          }
          return acc;
        },
        new Map()
      )
      .entries())
      .filter(a => a[1] > 9)
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([domain, count]) => `${domain}${' '.repeat(100 - domain.length)}${count}`);
  }

  mitmSgmodule = undefined;

  adguardhome(whitelist: Set<string | `.${string}`>): string[] {
    const results: string[] = [];

    const whitelistArray = sortDomains(Array.from(whitelist));
    for (let i = 0, len = whitelistArray.length; i < len; i++) {
      const domain = whitelistArray[i];
      if (domain[0] === '.') {
        results.push(`@@||${domain.slice(1)}^`);
      } else {
        results.push(`@@|${domain}^`);
      }
    }

    for (let i = 0, len = this.$preprocessed.length; i < len; i++) {
      const domain = this.$preprocessed[i];
      if (domain[0] === '.') {
        results.push(`||${domain.slice(1)}^`);
      } else {
        results.push(`|${domain}^`);
      }
    }

    return results;
  }
}
