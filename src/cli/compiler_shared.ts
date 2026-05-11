export function collectLocalVars(body: any[], params: string[], outerLocals?: Set<string>): { locals: Set<string>, initExprs: Map<string, any>, reassignedVars: Set<string>, forInScopedVars: Set<string> } {
    const locals = new Set<string>();
    const paramSet = new Set(params);
    const forInitVars = new Set<string>();
    const forInScopedVars = new Set<string>();
    const outerSet = outerLocals || new Set<string>();
    const initExprs = new Map<string, any>();
    const firstAssignInBranch = new Set<string>();
    const reassignedVars = new Set<string>();
    function walk(node: any, inBranch: boolean, inForIn: boolean) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach((n: any) => walk(n, inBranch, inForIn)); return; }
        if (node.type === 'FunctionDef') {
            function findModifications(n: any, depth: number) {
                if (!n || typeof n !== 'object') return;
                if (Array.isArray(n)) { n.forEach((x: any) => findModifications(x, depth)); return; }
                if (n.type === 'Action' && n.target) {
                    findModifications(n.target, depth);
                }
                if (n.type === 'Assignment' || n.type === 'Assign') {
                    const t = n.target || n.left;
                    if (t && t.type === 'Identifier' && locals.has(t.name)) {
                        reassignedVars.add(t.name);
                    } else if (typeof t === 'string' && locals.has(t)) {
                        reassignedVars.add(t);
                    }
                }
                if (n.type === 'FunctionDef') {
                    if (n.body && depth < 3) {
                        n.body.forEach((s: any) => findModifications(s, depth + 1));
                    }
                    return;
                }
                for (const val of Object.values(n)) {
                    if (typeof val === 'object' && val !== null) findModifications(val, depth);
                }
            }
            findModifications(node, 0);
            return;
        }
        const isForIn = node.type === 'ForIn';
        const isBranch = inBranch || node.type === 'IfStmt' || node.type === 'If' || node.type === 'WhileStmt' || node.type === 'While' || node.type === 'ForStmt' || node.type === 'For' || node.type === 'Switch' || node.type === 'SwitchStmt' || isForIn;
        if ((node.type === 'ForStmt' || node.type === 'For') && node.init) {
            let init = node.init;
            if (init.type === 'Action' && init.target) init = init.target;
            if (init.type === 'VarDecl' && init.name) {
                forInitVars.add(init.name);
            } else if (init.type === 'Assignment' || init.type === 'Assign') {
                const t = init.target || init.left;
                if (t && t.type === 'Identifier') forInitVars.add(t.name);
                else if (typeof t === 'string') forInitVars.add(t);
            }
        }
        if (node.type === 'VarDecl' && node.name && !paramSet.has(node.name)) {
            locals.add(node.name);
            if (node.value && !isBranch && !firstAssignInBranch.has(node.name)) {
                initExprs.set(node.name, node.value);
            }
        }
        if (node.type === 'Assignment' || node.type === 'Assign') {
            const t = node.target || node.left;
            const v = node.value || node.right;
            if (t?.type === 'ArrayLiteral') {
              const elements = t.elements || [];
              for (const el of elements) {
                if (el.type === 'Identifier' && !paramSet.has(el.name) && !outerSet.has(el.name)) {
                  locals.add(el.name);
                  if (!initExprs.has(el.name) && !firstAssignInBranch.has(el.name)) {
                    firstAssignInBranch.add(el.name);
                  }
                } else if (el.type === 'SpreadElement' || el.operator === '...') {
                  const restName = el.argument?.name || el.name;
                  if (restName && !paramSet.has(restName) && !outerSet.has(restName)) {
                    locals.add(restName);
                    if (!initExprs.has(restName) && !firstAssignInBranch.has(restName)) {
                      firstAssignInBranch.add(restName);
                    }
                  }
                }
              }
            }
            if (t && t.type === 'Identifier' && !paramSet.has(t.name) && !outerSet.has(t.name)) {
                if (inForIn || isForIn) {
                    if (locals.has(t.name)) {
                        reassignedVars.add(t.name);
                    } else {
                        forInScopedVars.add(t.name);
                        if (!initExprs.has(t.name) && v) {
                            initExprs.set(t.name, v);
                        }
                    }
                } else {
                    locals.add(t.name);
                    if (initExprs.has(t.name) || firstAssignInBranch.has(t.name)) {
                        reassignedVars.add(t.name);
                    } else if (!initExprs.has(t.name) && !firstAssignInBranch.has(t.name)) {
                        if (v && !isBranch) {
                            initExprs.set(t.name, v);
                        } else {
                            firstAssignInBranch.add(t.name);
                        }
                    }
                }
            } else if (typeof t === 'string' && !paramSet.has(t) && !outerSet.has(t)) {
                if (inForIn || isForIn) {
                    if (locals.has(t)) {
                        reassignedVars.add(t);
                    } else {
                        forInScopedVars.add(t);
                    }
                } else {
                    locals.add(t);
                    if (initExprs.has(t) || firstAssignInBranch.has(t)) {
                        reassignedVars.add(t);
                    } else if (!initExprs.has(t) && !firstAssignInBranch.has(t)) {
                        if (v && !isBranch) {
                            initExprs.set(t, v);
                        } else {
                            firstAssignInBranch.add(t);
                        }
                    }
                }
            }
        }
        if (node.type === 'Declaration' && node.object) {
            const obj = node.object;
            if (obj.type === 'Assignment') {
                const t = obj.target;
                if (t && t.type === 'Identifier' && !paramSet.has(t.name) && !outerSet.has(t.name)) {
                    locals.add(t.name);
                    const v = obj.value || obj.right;
                    if (v && !isBranch && !firstAssignInBranch.has(t.name)) {
                        initExprs.set(t.name, v);
                    }
                }
            }
        }
        const nextInForIn = inForIn || isForIn;
        for (const val of Object.values(node)) {
            if (typeof val === 'object' && val !== null) {
                walk(val, isBranch, nextInForIn);
            }
        }
    }
    body.forEach((n: any) => walk(n, false, false));
    for (const v of forInitVars) initExprs.delete(v);
    for (const v of forInitVars) forInScopedVars.delete(v);
    for (const v of firstAssignInBranch) initExprs.delete(v);
    for (const v of forInScopedVars) { locals.delete(v); reassignedVars.delete(v); initExprs.delete(v); }
    return { locals, initExprs, reassignedVars, forInScopedVars };
}

export function hasLoopInBody(body: any[]): boolean {
    for (const s of body) {
        if (s.type === 'ForStmt' || s.type === 'For' || s.type === 'WhileStmt' || s.type === 'While' || s.type === 'ForIn') return true;
        if (s.body && Array.isArray(s.body) && hasLoopInBody(s.body)) return true;
        if (s.thenBranch && Array.isArray(s.thenBranch) && hasLoopInBody(s.thenBranch)) return true;
        if (s.elseBranch && Array.isArray(s.elseBranch) && hasLoopInBody(s.elseBranch)) return true;
    }
    return false;
}

export function collectForInBodyVars(body: any[], forInVar: string, forInScoped: Set<string>, _declaredLocals: Set<string>): { inputVars: string[], outputVars: string[] } {
    const assignedInBody = new Set<string>();
    const allUsed = new Set<string>();
    function findUses(node: any) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(n => findUses(n)); return; }
        if (node.type === 'Identifier') allUsed.add(node.name);
        for (const val of Object.values(node)) {
            if (typeof val === 'object' && val !== null) findUses(val);
        }
    }
    function findAssigns(node: any) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(n => findAssigns(n)); return; }
        if (node.type === 'Action' && node.target && node.target.type === 'Assignment') {
            const t = node.target.target || node.target.left;
            if (t && t.type === 'Identifier' && forInScoped.has(t.name)) assignedInBody.add(t.name);
        }
        if (node.type === 'Assignment' || node.type === 'Assign') {
            const t = node.target || node.left;
            if (t && t.type === 'Identifier' && forInScoped.has(t.name)) assignedInBody.add(t.name);
        }
        for (const val of Object.values(node)) {
            if (typeof val === 'object' && val !== null) findAssigns(val);
        }
    }
    for (const s of body) { findUses(s); findAssigns(s); }
    const inputVars: string[] = [];
    if (allUsed.has(forInVar)) inputVars.push(forInVar);
    const outputVars: string[] = [];
    for (const v of assignedInBody) {
        if (allUsed.has(v) || forInScoped.has(v)) outputVars.push(v);
    }
    return { inputVars, outputVars };
}
