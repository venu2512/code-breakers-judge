import type { Language } from "./languages";

/** Starter templates. They all read the whole of stdin so teams can begin fast. */
export const TEMPLATES: Record<Language, string> = {
  python: `import sys

def main():
    data = sys.stdin.read()
    # TODO: parse "data" and print the answer
    # Example: print(sum(map(int, data.split())))
    print()

if __name__ == "__main__":
    main()
`,
  c: `#include <stdio.h>

int main(void) {
    /* TODO: read input with scanf and print the answer */
    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // TODO: read input with cin and print the answer
    return 0;
}
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO: read input with sc and print the answer
    }
}
`,
  javascript: `const fs = require("fs");
const data = fs.readFileSync(0, "utf8");
// TODO: parse "data" and print the answer
console.log();
`,
};
