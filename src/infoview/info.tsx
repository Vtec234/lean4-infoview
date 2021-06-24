import * as React from 'react';
import { Location } from 'vscode-languageserver-protocol';

import { getGoals, Goal, TermGoal } from './goal';
import { basename, DocumentPosition, RangeHelpers, useEvent, usePausableState, useServerNotificationState } from './util';
import { CopyToCommentIcon, PinnedIcon, PinIcon, ContinueIcon, PauseIcon, RefreshIcon, GoToFileIcon } from './svg_icons';
import { Details } from './collapsing';
import { PlainGoal, PlainTermGoal, LeanFileProgressParams, LeanDiagnostic } from '../lspTypes';
import { EditorContext } from './contexts';
import { MessagesAtFile, useMessagesFor } from './messages';

type InfoStatus = 'loading' | 'updating' | 'error' | 'ready';
type InfoKind = 'cursor' | 'pin';

interface InfoPinnable {
    kind: InfoKind;
    /** Takes an argument for caching reasons, but should only ever (un)pin itself. */
    onPin: (pos: DocumentPosition) => void;
}

interface InfoStatusBarProps extends InfoPinnable {
    pos: DocumentPosition;
    status: InfoStatus;
    isPaused: boolean;
    copyGoalToComment?: () => void;
    setPaused: (p: boolean) => void;
    triggerUpdate: () => Promise<void>;
}

export function InfoStatusBar(props: InfoStatusBarProps) {
    const { kind, onPin, status, pos, isPaused, copyGoalToComment, setPaused, triggerUpdate } = props;

    const ec = React.useContext(EditorContext);

    const statusColTable: {[T in InfoStatus]: string} = {
        'loading': 'gold',
        'updating': 'gold',
        'error': 'dark-red',
        'ready': '',
    }
    const statusColor = statusColTable[status];
    const locationString = `${basename(pos.uri)}:${pos.line+1}:${pos.character}`;
    const isPinned = kind === 'pin';

    return (
    <summary style={{transition: 'color 0.5s ease'}} className={'mv2 ' + statusColor}>
        {locationString}
        {isPinned && !isPaused && ' (pinned)'}
        {!isPinned && isPaused && ' (paused)'}
        {isPinned && isPaused && ' (pinned and paused)'}
        <span className="fr">
            {copyGoalToComment &&
                <a className="link pointer mh2 dim" title="copy state to comment" onClick={e => { e.preventDefault(); copyGoalToComment(); }}>
                    <CopyToCommentIcon/>
                </a>}
            {isPinned &&
                <a className={'link pointer mh2 dim '} onClick={e => { e.preventDefault(); void ec.revealPosition(pos); }} title="reveal file location">
                    <GoToFileIcon/>
                </a>}
            <a className="link pointer mh2 dim" onClick={e => { e.preventDefault(); onPin(pos); }} title={isPinned ? 'unpin' : 'pin'}>
                {isPinned ? <PinnedIcon/> : <PinIcon/>}
            </a>
            <a className="link pointer mh2 dim" onClick={e => { e.preventDefault(); setPaused(!isPaused); }} title={isPaused ? 'continue updating' : 'pause updating'}>
                {isPaused ? <ContinueIcon/> : <PauseIcon/>}
            </a>
            <a className={'link pointer mh2 dim'} onClick={e => { e.preventDefault(); void triggerUpdate(); }} title="update">
                <RefreshIcon/>
            </a>
        </span>
    </summary>
    );
}

interface InfoDisplayProps extends InfoPinnable {
    pos: DocumentPosition;
    status: InfoStatus;
    messages: LeanDiagnostic[];
    goal?: PlainGoal;
    termGoal?: PlainTermGoal;
    error?: string;
    triggerUpdate: () => Promise<void>;
}

/** Displays goal state and messages. Can be paused. */
export function InfoDisplay(props0: InfoDisplayProps) {
    // Used to update the paused state once if a display update is triggered
    const [shouldRefresh, setShouldRefresh] = React.useState<boolean>(false);
    const [isPaused, setPaused, props, propsRef] = usePausableState(false, props0);
    if (shouldRefresh) {
        propsRef.current = props0;
        setShouldRefresh(false);
    }
    const triggerDisplayUpdate = async () => {
        await props0.triggerUpdate();
        setShouldRefresh(true);
    };

    const {kind, pos, status, messages, goal, termGoal, error} = props;

    const ec = React.useContext(EditorContext);
    let copyGoalToComment: (() => void) | undefined = undefined;
    if (goal) copyGoalToComment = () => { void ec.copyToComment(getGoals(goal).join('\n\n')); }
    
    // If we are the cursor infoview, then we should subscribe to
    // some commands from the extension
    const isCursor = kind === 'cursor';
    useEvent(ec.events.requestedAction, act => {
        if (!isCursor) return;
        if (act.kind !== 'copyToComment') return;
        copyGoalToComment && copyGoalToComment();
    }, [goal]);
    useEvent(ec.events.requestedAction, act => {
        if (!isCursor) return;
        if (act.kind !== 'togglePaused') return;
        setPaused(isPaused => !isPaused);
    });

    const nothingToShow = !error && !goal && !termGoal && messages.length === 0;

    return (
    <Details initiallyOpen>
        <InfoStatusBar {...props} triggerUpdate={triggerDisplayUpdate} isPaused={isPaused} setPaused={setPaused} copyGoalToComment={copyGoalToComment} />
        <div className="ml1">
            {status === 'error' && error &&
                <div className="error">
                    Error updating: {error}.
                    <a className="link pointer dim" onClick={e => { e.preventDefault(); triggerDisplayUpdate(); }}>Try again.</a>
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
                isPaused ?
                    <span>Updating is paused. <a className="link pointer dim" onClick={e => { e.preventDefault(); triggerDisplayUpdate(); }}>Refresh</a> or <a className="link pointer dim" onClick={e => { e.preventDefault(); setPaused(false); }}>resume updating</a> to see information.</span> :
                    status === 'ready' ? 'No info found.' : 'Loading...')}
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
function useDelayedThrottled(ms: number, cb: () => Promise<void>): () => Promise<void> {
    const waiting = React.useRef<boolean>(false);
    const callbackRef = React.useRef<() => Promise<void>>();
    callbackRef.current = cb;
    return async () => {
        if (!waiting.current) {
            waiting.current = true;
            let promise = new Promise((resolved, rejected) => {
                setTimeout(() => {
                    waiting.current = false;
                    callbackRef.current!().then(resolved, rejected);
                }, ms);
            });
            await promise;
        }
    };
}

/**
 * Note: in the cursor view, we have to keep the cursor position as part of the component state
 * to avoid flickering when the cursor moved. Otherwise, the component is re-initialised and the
 * goal states reset to `undefined` on cursor moves.
 */
export type InfoProps = InfoPinnable & { pos?: DocumentPosition };

/** Fetches info from the server and renders an {@link InfoDisplay}. */
export function Info(props: InfoProps) {
    const ec = React.useContext(EditorContext);

    // Note: `kind` may not change throughout the lifetime of an `Info` component,
    // otherwise the hooks will differ.
    const pos = props.kind === 'pin' ?
        props.pos! :
        (() => {
            const [curLoc, setCurLoc] = React.useState<Location>(ec.events.changedCursorLocation.current!);
            useEvent(ec.events.changedCursorLocation, setCurLoc, []);
            return { uri: curLoc.uri, ...curLoc.range.start };
        })();

    const [status, setStatus] = React.useState<InfoStatus>('loading');
    const [goal, setGoal] = React.useState<PlainGoal>();
    const [termGoal, setTermGoal] = React.useState<PlainTermGoal>();
    const [error, setError] = React.useState<string>();

    const messages = useMessagesFor(pos);
    const [serverIsProcessing, _] = useServerNotificationState(
        '$/lean/fileProgress',
        false,
        (_, params: LeanFileProgressParams) => isLoading(params, pos),
        [pos.uri, pos.line, pos.character]
    );

    const triggerUpdate = useDelayedThrottled(serverIsProcessing ? 500 : 50, async () => {
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

    React.useEffect(() => void triggerUpdate(), [pos.uri, pos.line, pos.character, serverIsProcessing]);

    return (
    <InfoDisplay {...props} pos={pos} status={status} messages={messages} goal={goal} termGoal={termGoal} error={error} triggerUpdate={triggerUpdate} />
    );
}