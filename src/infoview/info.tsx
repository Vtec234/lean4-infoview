import * as React from 'react';

import { getGoals, Goal, TermGoal } from './goal';
import { basename, DocumentPosition, RangeHelpers, usePausableState, useServerNotificationState } from './util';
import { CopyToCommentIcon, PinnedIcon, PinIcon, ContinueIcon, PauseIcon, RefreshIcon, GoToFileIcon } from './svg_icons';
import { Details } from './collapsing';
import { PlainGoal, PlainTermGoal, LeanFileProgressParams, LeanDiagnostic } from '../lspTypes';
import { EditorContext } from './contexts';
import { MessagesAtFile, useMessagesFor } from './messages';

type InfoStatus = 'loading' | 'updating' | 'error' | 'ready';

interface Pinnable {
    isPinned: boolean;
    onPin: (pos: DocumentPosition) => void;
}

interface InfoStatusBarProps extends Pinnable {
    status: InfoStatus;
    pos: DocumentPosition;
    isPaused: boolean;
    copyGoalToComment?: () => void;
    setPaused: (p: boolean) => void;
    triggerUpdate: () => void;
}

export function InfoStatusBar(props: InfoStatusBarProps) {
    const { status, pos, isPinned, isPaused, onPin, copyGoalToComment, setPaused, triggerUpdate } = props;

    const ec = React.useContext(EditorContext);

    const statusColTable: {[T in InfoStatus]: string} = {
        'loading': 'gold',
        'updating': 'gold',
        'error': 'dark-red',
        'ready': '',
    }
    const statusColor = statusColTable[status];
    const locationString = `${basename(pos.uri)}:${pos.line+1}:${pos.character}`;

    return (
    <summary style={{transition: 'color 0.5s ease'}} className={'mv2 ' + statusColor}>
        {locationString}
        {isPinned && !isPaused && ' (pinned)'}
        {!isPinned && isPaused && ' (paused)'}
        {isPinned && isPaused && ' (pinned and paused)'}
        <span className="fr">
            {copyGoalToComment && <a className="link pointer mh2 dim" title="copy state to comment" onClick={e => {e.preventDefault(); copyGoalToComment(); }}><CopyToCommentIcon/></a>}
            {isPinned && <a className={'link pointer mh2 dim '} onClick={e => { e.preventDefault(); void ec.revealPosition(pos); }} title="reveal file location"><GoToFileIcon/></a>}
            <a className="link pointer mh2 dim" onClick={e => { e.preventDefault(); onPin(pos); }} title={isPinned ? 'unpin' : 'pin'}>{isPinned ? <PinnedIcon/> : <PinIcon/>}</a>
            <a className="link pointer mh2 dim" onClick={e => { e.preventDefault(); setPaused(!isPaused); }} title={isPaused ? 'continue updating' : 'pause updating'}>{isPaused ? <ContinueIcon/> : <PauseIcon/>}</a>
            { !isPaused && <a className={'link pointer mh2 dim'} onClick={e => { e.preventDefault(); triggerUpdate(); }} title="update"><RefreshIcon/></a> }
        </span>
    </summary>
    );
}

interface InfoProps extends Pinnable {
    pos: DocumentPosition;
    isCursor: boolean;
}

interface InfoDisplayProps extends InfoProps {
    status: InfoStatus;
    messages: LeanDiagnostic[];
    goal?: PlainGoal;
    termGoal?: PlainTermGoal;
    error?: string;
    triggerUpdate: () => void;
}

/** Displays goal state and messages. Can be paused. */
export function InfoDisplay(props0: InfoDisplayProps) {
    // We don't want to pause the value of this callback
    const triggerUpdate = props0.triggerUpdate;
    const [isPaused, setPaused, props] = usePausableState(false, props0);

    const {pos, status, messages, goal, termGoal, error} = props;

    const ec = React.useContext(EditorContext);
    let copyGoalToComment = undefined;
    if (goal) copyGoalToComment = () => { void ec.copyToComment(getGoals(goal).join('\n\n')); }
    

    // If we are the cursor infoview, then we should subscribe to
    // some commands from the extension
    //useEvent(copyToCommentEvent, () => isCursor && copyGoalToComment(), [isCursor, goal]);
    //useEvent(pauseEvent, () => isCursor && setPaused(true), [isCursor]);
    //useEvent(continueEvent, () => isCursor && setPaused(false), [isCursor]);
    //useEvent(toggleUpdating, () => isCursor && setPaused(!isCurrentlyPaused.current), [isCursor]);
    // TODO: updating of paused views
    // const forceUpdate = () => !isCurrentlyPaused.current && stateRef.current.triggerUpdate();

    const nothingToShow = !error && !goal && !termGoal && messages.length === 0;

    return (
    <Details initiallyOpen>
        <InfoStatusBar {...props} triggerUpdate={triggerUpdate} isPaused={isPaused} setPaused={setPaused} copyGoalToComment={copyGoalToComment} />
        <div className="ml1">
            {status === 'error' && error &&
                <div className="error">
                    Error updating: {error}.
                    <a className="link pointer dim" onClick={e => { e.preventDefault(); triggerUpdate(); }}>Try again.</a>
                </div>}
            {status !== 'error' && goal && 
                <Details initiallyOpen>
                    <summary>
                        Tactic state
                    </summary>
                    <div className='ml1'>
                        <Goal plainGoal={goal} />
                    </div>
                </Details>}
            {status !== 'error' && termGoal && 
                <Details initiallyOpen>
                    <summary>
                        Expected type
                    </summary>
                    <div className='ml1'>
                        <TermGoal termGoal={termGoal} />
                    </div>
                </Details>}
            {status !== 'error' && messages.length !== 0 &&
                <Details initiallyOpen>
                    <summary className="mv2 pointer">Messages ({messages.length})</summary>
                    <div className="ml1">
                        <MessagesAtFile uri={pos.uri} messages={messages}/>
                    </div>
                </Details>}
            {nothingToShow && (
                status === 'ready' ? 'No info found.' :
                isPaused ? <span>Updating is paused. <a className="link pointer dim" onClick={e => { e.preventDefault(); triggerUpdate(); }}>Refresh</a> or <a className="link pointer dim" onClick={e => { e.preventDefault(); setPaused(false) }}>resume updating</a> to see information</span> :
                'Loading...')}
        </div>
    </Details>
    );
}

function isLoading(ts: LeanFileProgressParams, p: DocumentPosition): boolean {
    return ts.processing.some(i => RangeHelpers.contains(i.range, p));
}

/**
 * returns function that triggers `cb`
 * - but only `ms` milliseconds after the first call
 * - and not more often than once every `ms` milliseconds
 */
function delayedThrottled(ms: number, cb: () => void): () => void {
    const waiting = React.useRef<boolean>(false);
    const callbackRef = React.useRef<() => void>();
    callbackRef.current = cb;
    return () => {
        if (!waiting.current) {
            waiting.current = true;
            setTimeout(() => {
                waiting.current = false;
                callbackRef.current!();
            }, ms);
        }
    };
}

/** Fetches info from the server and renders an {@link InfoDisplay}. */
export function Info(props: InfoProps) {
    const {pos} = props;

    const ec = React.useContext(EditorContext);

    const [status, setStatus] = React.useState<InfoStatus>('loading');
    const [serverIsProcessing, _] = useServerNotificationState(
        '$/lean/fileProgress',
        false,
        (_, params: LeanFileProgressParams) => isLoading(params, pos),
        [pos]
    );

    const messages = useMessagesFor(pos);

    const [goal, setGoal] = React.useState<PlainGoal>();
    const [termGoal, setTermGoal] = React.useState<PlainTermGoal>();
    const [error, setError] = React.useState<string>();

    const triggerUpdate = delayedThrottled(serverIsProcessing ? 500 : 50, async () => {
        setStatus('updating');

        // Start both goal requests before awaiting them.
        const plainTermGoalReq = ec.requestPlainTermGoal(pos);
        const plainGoalReq = ec.requestPlainGoal(pos);

        function onError(err: any) {
            const errS = typeof err === 'string' ? err : JSON.stringify(err);
            setError(`Error fetching goals: ${errS}`);
            setStatus('error');
        }

        try {
            const plainGoal = await plainGoalReq;
            setGoal(plainGoal);
        } catch (err) {
            if (err?.code === -32801) {
                // Document has been changed since we made the request, try again
                triggerUpdate();
                return;
            } else { onError(err); }
        }

        try {
            const plainTermGoal = await plainTermGoalReq;
            setTermGoal(plainTermGoal);
        } catch (err) {
            if (err?.code === -32801) {
                // Document has been changed since we made the request, try again
                triggerUpdate();
                return;
            } else { onError(err); }
        }

        setStatus('ready');
    });

    React.useEffect(triggerUpdate, [pos, serverIsProcessing]);
    // useEvent(serverRestarted, triggerUpdate);
    // useEvent(global_server.error, triggerUpdate);

    return (
    <InfoDisplay {...props} status={status} messages={messages} goal={goal} termGoal={termGoal} error={error} triggerUpdate={triggerUpdate} />
    );
}

/** Fetches info from the server and renders an {@link InfoDisplay}. */
export function InfoWorking(props: InfoProps) {
    const ec = React.useContext(EditorContext);
    const [goal, setGoal] = React.useState<PlainGoal | undefined>(undefined);
    React.useEffect(() => {
        ec.requestPlainGoal(props.pos)
            .then(goal => setGoal(goal),
                  err => console.log(`'$/lean/plainGoal' err: ${err}`));
    }, [props.pos]);

    return <Details initiallyOpen>
        <InfoStatusBar {...props} status='updating' pos={props.pos} isPinned={false} isPaused={false} onPin={()=>{}} setPaused={b=>{}} triggerUpdate={()=>{}} />
        <div className="ml1">
            {goal && <Goal plainGoal={goal} /> }
        </div>
    </Details>;
}