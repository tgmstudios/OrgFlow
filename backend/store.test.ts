import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore,seed} from './store';
test('SQLite survives reopen and seed does not overwrite staff changes',async()=>{const dir=mkdtempSync(join(tmpdir(),'orgflow-store-'));try{const options={sqlitePath:join(dir,'workspace.sqlite')};let store=await openStore(options);await seed(store);await store.put('categories',{id:'cat-people',name:'Staff category'});await store.close();store=await openStore(options);await seed(store);expect((await store.get('categories','cat-people'))?.name).toBe('Staff category');expect((await store.list('articles')).length).toBe(1);await store.close()}finally{rmSync(dir,{recursive:true,force:true})}});
