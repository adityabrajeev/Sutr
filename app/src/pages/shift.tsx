import { useNavigate, Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, Clock, MapPin, Siren, Timer, UserCheck, Users, Inbox, Phone, Radio } from 'lucide-react'
import { useApi, post } from '../api'
import { Page } from '../shell'
import { Card, CardHeader, cx, Divided, Empty, ErrorBox, Loading, Status, Ticket, useCountdown, useToast, Button } from '../ui'
import { ago, date, hhmm, time } from '../format'

/** Coordinator home: the job is "what do I do next on my shift", not "how is the agency doing". */
export default function Shift() {
  const { data, error, reload } = useApi<any>('/shift', { poll: 30000 })
  const nav = useNavigate()
  const toast = useToast()
  if (error) return <Page><ErrorBox error={error} retry={reload} /></Page>
  if (!data) return <Loading />
  const n = data.now
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const liveWid = n?.kind === 'live' ? n.wedding_id : n?.wedding_id || data.weddings[0]?.id
  const complete = async (t: any) => {
    try { await post(`/tasks/${t.id}/action`, { action: 'complete' }); toast(t.requires_proof ? 'Sent for review' : 'Done'); reload() }
    catch (e: any) { toast(e.message, 'error'); nav(t.wedding_id ? `/w/${t.wedding_id}/tasks` : '/tasks') }
  }
  return (
    <Page>
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="text-[27px]">{hello}, {data.user.name.split(' ')[0]}</h1>
          <p className="text-mute">{date(data.today, { weekday: 'long', day: 'numeric', month: 'long' })}. You're on {data.weddings.length === 1 ? data.weddings[0].name : `${data.weddings.length} weddings`}.</p>
        </header>

        <NowTicket n={n} onOpen={() => liveWid && nav(`/w/${liveWid}/live`)} onTask={complete} />

        {liveWid && (
          <div className="grid grid-cols-3 gap-2">
            {[[UserCheck, 'Check in a guest'], [Siren, 'Log an incident'], [Timer, 'Vendor running late']].map(([I, l]: any) => (
              <button key={l} onClick={() => nav(`/w/${liveWid}/live`)} className="flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-xl border border-line bg-card p-3 text-left text-sm font-semibold hover:border-brand/40">
                <I className="size-5 text-brand" aria-hidden />{l}
              </button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader title="Your tasks today" sub={data.later_tasks ? `${data.later_tasks} more later this week` : undefined} icon={CheckCircle2} action={<Link to="/tasks?filter=mine" className="text-sm font-semibold text-brand">All tasks</Link>} />
          {data.tasks.length ? <Divided>{data.tasks.map((t: any) => {
            const late = t.due_at && t.due_at < new Date().toISOString()
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <button onClick={() => complete(t)} aria-label={`Mark "${t.title}" done`} className="grid size-11 shrink-0 place-items-center rounded-full text-mute hover:text-ok"><Circle className="size-6" /></button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.title}</div>
                  <div className={cx('text-sm', late ? 'text-bad' : 'text-mute')}>{t.due_at ? (late ? `Was due ${ago(t.due_at)}` : `Due ${time(t.due_at)}`) : 'No due time'}{t.wedding ? <span className="text-mute">, {t.wedding}</span> : null}</div>
                </div>
                {t.status === 'blocked' && <Status s="blocked" />}
              </div>
            )
          })}</Divided> : <Empty icon={CheckCircle2} title="Nothing due today" sub="Tasks assigned to you show up here." />}
        </Card>

        {data.incidents.length > 0 && (
          <Card>
            <CardHeader title="Incidents to handle" icon={AlertTriangle} />
            <Divided>{data.incidents.map((i: any) => (
              <button key={i.id} onClick={() => nav(`/w/${i.wedding_id}/live`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas sm:px-5">
                <Status s={i.severity} />
                <span className="min-w-0 flex-1"><span className="block font-semibold">{i.title}</span><span className="block text-sm text-mute">{i.owner_id ? 'Assigned to you' : 'Unassigned'}, opened {ago(i.created_at)}</span></span>
              </button>
            ))}</Divided>
          </Card>
        )}

        {data.vendors.length > 0 && (
          <Card>
            <CardHeader title="Vendors needing a nudge" icon={Users} />
            <Divided>{data.vendors.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1"><div className="font-semibold">{v.name}</div><div className="text-sm text-mute">{v.live_status === 'delayed' ? `Running ${v.delay_min} min late` : `Hasn't confirmed, reports ${date(v.report_at)} ${time(v.report_at)}`}</div></div>
                {v.phone && <a href={`tel:${v.phone}`} className="grid size-11 place-items-center rounded-full bg-wash" aria-label={`Call ${v.name}`}><Phone className="size-4" /></a>}
              </div>
            ))}</Divided>
          </Card>
        )}

        <Card>
          <CardHeader title="Today's functions" icon={CalendarClock} />
          {data.functions.length ? (
            <ol className="space-y-4 px-5 py-4">
              {data.functions.map((f: any) => (
                <li key={f.id} className="flex gap-4">
                  <div className="sign w-16 shrink-0 pt-0.5 text-[20px] text-ink">{hhmm(f.start_time) || '—'}</div>
                  <div className="min-w-0 border-l-2 border-line pl-4" style={f.live_status === 'live' ? { borderColor: 'var(--color-bad)' } : undefined}>
                    <div className="font-semibold">{f.name} {f.live_status === 'live' && <span className="ml-1 text-sm font-semibold text-bad">on now</span>}</div>
                    <div className="flex items-center gap-1.5 text-sm text-mute"><MapPin className="size-3.5" aria-hidden />{f.venue}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="px-5 py-4 text-sm text-mute">No functions today on your weddings.</div>}
        </Card>

        <Card>
          <CardHeader title="Your weddings" />
          <Divided>{data.weddings.map((w: any) => (
            <Link key={w.id} to={`/w/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5">
              <div className="min-w-0 flex-1"><div className="font-semibold">{w.name}</div><div className="text-sm text-mute">Your part: {(w.responsibilities || []).join(', ') || 'support'}</div></div>
              <Status s={w.status} />
            </Link>
          ))}</Divided>
        </Card>
        {data.inbox > 0 && <Link to={`/w/${liveWid}/comms?tab=inbox`} className="flex items-center gap-2 text-sm font-semibold text-brand"><Inbox className="size-4" />{data.inbox === 1 ? '1 message is' : `${data.inbox} messages are`} waiting for a reply</Link>}
      </div>
    </Page>
  )
}

function NowTicket({ n, onOpen, onTask }: { n: any; onOpen: () => void; onTask: (t: any) => void }) {
  const cd = useCountdown(n?.kind === 'event' || n?.kind === 'function' ? n.at : n?.kind === 'countdown' ? n.date : null)
  if (!n) return <Ticket stub="All clear" title="Nothing scheduled for you" sub="New tasks and incidents will appear here." />
  if (n.kind === 'live') return (
    <Ticket live stub="On now" title={n.function} sub={`${n.wedding}, ${n.venue}`} sign={`${n.arrived}/${n.expected}`} signLabel="guests in"
      rows={[{ icon: Clock, text: n.end_time ? `Runs until ${hhmm(n.end_time)}` : 'Running now' }, { icon: AlertTriangle, text: n.incidents ? `${n.incidents} open incident${n.incidents === 1 ? '' : 's'} on this wedding` : 'No open incidents' }]}
      actions={<Button variant="haldi" size="lg" icon={Radio} onClick={onOpen}>Open the live board</Button>} />
  )
  if (n.kind === 'overdue') return (
    <Ticket stub="Overdue" stubIcon={AlertTriangle} title={n.task.title} sub={n.task.wedding} sign={ago(n.task.due_at).replace(' ago', '')} signLabel="late"
      actions={<><Button variant="haldi" size="lg" icon={CheckCircle2} onClick={() => onTask(n.task)}>Mark done</Button></>} />
  )
  if (n.kind === 'event' || n.kind === 'function') return (
    <Ticket stub="Up next" stubIcon={CalendarClock} title={n.title} sub={n.wedding} sign={cd?.text} signLabel="to go"
      rows={[{ icon: Clock, text: `${date(n.at)} at ${time(n.at)}` }, ...(n.where ? [{ icon: MapPin, text: n.where }] : [])]} />
  )
  return <Ticket stub="Next wedding" stubIcon={CalendarClock} title={n.wedding} sub={n.venue} sign={cd?.text} signLabel="to go" rows={[{ icon: Clock, text: date(n.date, { weekday: 'long', day: 'numeric', month: 'long' }) }]} />
}
