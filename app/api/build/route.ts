import {buildRevision} from '../../../lib/build-revision';
export const dynamic='force-dynamic';
export function GET(){return Response.json(buildRevision,{headers:{'cache-control':'no-store'}});}
